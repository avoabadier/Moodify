let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const basicAuth = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Refresh a minute before actual expiry to stay safe.
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

function toTrack(item) {
  return {
    id: item.id,
    name: item.name,
    artists: item.artists.map((a) => a.name).join(", "),
    albumArtUrl: item.album?.images?.[0]?.url ?? null,
    spotifyUrl: item.external_urls.spotify,
  };
}

// This app's Spotify quota rejects `limit` above 10 (400 "Invalid limit"),
// even though the public docs list 50 as the max — confirmed empirically.
const SEARCH_LIMIT = 10;

// Popularity-weighting exponent for weightedPick(). Lower = flatter weights,
// more niche/discovery picks get a real shot; higher = more mainstream-biased
// (heavily favors whatever's already popular). Retune here, nowhere else.
//
// IMPORTANT: this app's Spotify quota does not return a `popularity` field
// at all — confirmed absent on /v1/search, /v1/tracks/{id}, and
// /v1/artists/{id} (the batch /v1/tracks?ids= endpoint 403s outright for
// this app). So `t.popularity` below is always `undefined`, every track
// gets the same weight, and weightedPick() is currently mathematically
// identical to a uniform random pick — this exponent does nothing right
// now. It's left in place (harmless) in case this app's quota ever changes;
// don't assume raising/lowering it visibly changes behavior until you've
// confirmed `popularity` is actually present in a real response again.
const POPULARITY_ALPHA = 0.5;

// Since there's no popularity signal, "generic filler" tracks (mass-produced
// mood/genre catalog accounts, common on lofi-flavored queries) are instead
// detected by a heuristic: their artist name is itself built entirely from
// generic mood/genre descriptor words (e.g. "Cozy Bedroom Lofi", "SleepyTunes
// Lofi", "Rainy Acoustic Piano") rather than a real band/artist name. This is
// fuzzy, not a hard signal — it can miss content-mill artists with
// invented-sounding brand names (e.g. "Snemu", "Hickah") that don't contain
// any of these words, and could in principle misfire on a real artist who
// happens to have chosen a generic-sounding name. Only checked against the
// primary artist's name, never the track title. Opt a mood into this via
// `excludeGenericArtists: true` in moodMap.js.
const GENERIC_ARTIST_KEYWORDS = [
  "lofi", "lo-fi", "acoustic", "piano", "ambient", "chillhop", "coffee",
  "cafe", "cozy", "sleepy", "sleep", "relax", "chill", "mellow", "vibes",
  "sounds", "tunes", "music", "loop", "session", "focus", "study",
  "meditation", "spa", "asmr", "instrumental", "beats",
];

// If the generic-artist filter would leave fewer than this many candidates,
// skip it for that pick rather than starving the pool — logged so it's
// visible if a mood's query genuinely doesn't have enough real-artist
// supply. Mirrors the "guard against pool starvation" rule used elsewhere
// in this pipeline (see excludeRecentArtists below).
const MIN_CANDIDATES_AFTER_GENERIC_FILTER = 5;

// A single /v1/search page is only 10 tracks (SEARCH_LIMIT) and, for
// genre/mood text queries, Spotify's relevance ranking correlates heavily
// with popularity — one artist's catalog can fill most of a page. Pulling
// several pages at increasing offsets and pooling them gives the picker a
// much less homogeneous candidate set to choose from.
const POOL_PAGE_OFFSETS = [0, 10, 20, 30, 40];

// How many pages of `altQuery` get pooled alongside `query`'s
// POOL_PAGE_OFFSETS (5). Deliberately shallow so the combined pool stays
// biased toward the primary query rather than an even 50/50 split — this
// is a pool-*composition* ratio (mood cells currently use `query` for
// named OPM artists and `altQuery` for genre-descriptor phrasing, see
// moodMap.js), not just "fewer API calls for the alt query."
//
// Trimmed from [0, 10] to [0] after live verification across all 12 moods
// (5 picks each) showed real noise from altQuery: clearly non-OPM,
// unrelated international artists (Outkast, Mighty Diamonds, a
// Freeway/JAY-Z/Beanie Sigel track, a Sufjan Stevens collab) surfaced via
// generic-genre-word matches on altQuery's phrasing (e.g. "summer pop
// funk", "chill afternoon") despite the "OPM" qualifier — these aren't
// content-mill filler (no keyword filter would catch a real artist's
// normal name), just genre-term matches unrelated to the Philippines.
// Reducing altQuery's pool share was the direct fix. Raise it again only
// if altQuery/crossover results become underrepresented in practice.
const ALT_QUERY_POOL_PAGE_OFFSETS = [0];

// Scopes every Search request to one market, so results reflect what's
// actually available/licensed there rather than generic global catalog
// noise. Matters most for altQuery's genre-descriptor phrasing — this is
// what gives a song that's genuinely big in this market (as opposed to
// just globally popular) a real chance to surface. Override via
// SPOTIFY_MARKET in .env; defaults to the Philippines since that's what
// the current OPM-anchored mood queries are tuned for.
const SEARCH_MARKET = process.env.SPOTIFY_MARKET || "PH";

// At most this many tracks from the same artist survive into the candidate
// pool, applied before any random/weighted selection. This is the main fix
// for "every pick is the same artist."
const MAX_TRACKS_PER_ARTIST = 2;

// Per-mood (per query string) memory of recently-shown primary artist IDs,
// so consecutive reshuffles don't immediately repeat an artist. In-memory
// only — no persistence, resets on server restart, which is fine.
const RECENT_ARTIST_MEMORY = 4;
const recentArtistsByQuery = new Map();

async function searchTracksPage(token, query, offset) {
  const params = new URLSearchParams({
    q: query,
    type: "track",
    market: SEARCH_MARKET,
    limit: String(SEARCH_LIMIT),
    offset: String(offset),
  });

  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Spotify search failed: ${res.status}`);
  }

  const data = await res.json();
  return (data.tracks?.items ?? []).filter((item) => item?.id);
}

// `altQuery` (if present) is pooled alongside `query` rather than
// replacing it, but at a shallower depth (ALT_QUERY_POOL_PAGE_OFFSETS) so
// the combined pool stays biased toward `query` — see that constant's
// comment for why.
async function buildCandidatePool(query, altQuery, baseOffset) {
  const token = await getAccessToken();
  const requests = [
    ...POOL_PAGE_OFFSETS.map((relOffset) =>
      searchTracksPage(token, query, baseOffset + relOffset)
    ),
    ...(altQuery
      ? ALT_QUERY_POOL_PAGE_OFFSETS.map((relOffset) =>
          searchTracksPage(token, altQuery, baseOffset + relOffset)
        )
      : []),
  ];
  const pages = await Promise.all(requests);
  return pages.flat();
}

function capPerArtist(items, maxPerArtist) {
  const countByArtist = new Map();
  const capped = [];

  for (const item of items) {
    const artistId = item.artists?.[0]?.id ?? item.artists?.[0]?.name;
    const count = countByArtist.get(artistId) ?? 0;
    if (count >= maxPerArtist) continue;
    countByArtist.set(artistId, count + 1);
    capped.push(item);
  }

  return capped;
}

// Excludes recently-shown artists, but only if doing so still leaves at
// least one candidate — never lets the exclusion list empty the pool.
function excludeRecentArtists(items, recentArtistIds) {
  if (!recentArtistIds || recentArtistIds.length === 0) return items;
  const filtered = items.filter(
    (item) => !recentArtistIds.includes(item.artists?.[0]?.id)
  );
  return filtered.length > 0 ? filtered : items;
}

function looksLikeGenericArtist(name) {
  const lower = (name ?? "").toLowerCase();
  return GENERIC_ARTIST_KEYWORDS.some((word) => lower.includes(word));
}

function filterOutGenericArtists(items) {
  // Check every credited artist, not just the first — a track like
  // "Abi, The Acoustic Room" would otherwise slip through because the
  // generic name is the second artist, not the first. Found via live
  // verification: "Abi, The Acoustic Room — Golden - Acoustic" surfaced
  // for Golden Hour despite this filter being on.
  const filtered = items.filter(
    (item) => !(item.artists ?? []).some((a) => looksLikeGenericArtist(a.name))
  );

  if (filtered.length < MIN_CANDIDATES_AFTER_GENERIC_FILTER) {
    console.warn(
      `[spotify] generic-artist filter would leave only ${filtered.length}/${items.length} ` +
        "candidates — skipping it for this pick (insufficient real-artist supply)."
    );
    return items;
  }

  return filtered;
}

function weightedPick(tracks, alpha = POPULARITY_ALPHA) {
  const weights = tracks.map((t) => Math.pow((t.popularity || 1) + 1, alpha));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < tracks.length; i++) {
    r -= weights[i];
    if (r <= 0) return tracks[i];
  }
  return tracks[tracks.length - 1];
}

function rememberArtist(query, artistId) {
  if (!artistId) return;
  const recent = recentArtistsByQuery.get(query) ?? [];
  recentArtistsByQuery.set(
    query,
    [artistId, ...recent.filter((id) => id !== artistId)].slice(0, RECENT_ARTIST_MEMORY)
  );
}

export async function pickRandomTrack(query, offset = 0, options = {}) {
  const { altQuery = null, excludeGenericArtists = false } = options;

  const pool = await buildCandidatePool(query, altQuery, offset);
  if (pool.length === 0) return null;

  const qualityFiltered = excludeGenericArtists
    ? filterOutGenericArtists(pool)
    : pool;
  const capped = capPerArtist(qualityFiltered, MAX_TRACKS_PER_ARTIST);
  const recentArtists = recentArtistsByQuery.get(query);
  const candidates = excludeRecentArtists(capped, recentArtists);

  const picked = weightedPick(candidates);
  rememberArtist(query, picked.artists?.[0]?.id);
  return toTrack(picked);
}
