// Mood mapping table: (time bucket, weather bucket) -> { label, query }
// Retune by editing this table only; no app logic depends on the wording.
//
// Only 3 weather buckets (Clear / Clouds / Rain) as of this table's last
// trim — Thunderstorm, Snow, and Mist/Fog were folded into these (see
// WEATHER_BUCKET_ALIASES below) rather than kept as their own columns.
// Fewer cells means each remaining query gets hit more often, which lets
// the pool-depth/popularity-floor work in spotify.js build a deeper,
// better candidate pool per query instead of splitting effort across 24
// thin, rarely-used ones.
//
// Query design: OPM-anchored, hybrid `query`/`altQuery` split.
// - `query` names specific real OPM (Filipino) artists directly, mixing
//   classic (90s-2000s) and modern (2015-now) acts. Naming artists is the
//   most reliable way to get recognizable results — solving the
//   "unrecognizable picks" problem at the source, same principle as the
//   generic-artist filter but applied to query design instead of
//   after-the-fact filtering.
// - `altQuery` carries an OPM-flavored genre/descriptor phrase instead,
//   for pool variety and as the opening for a genuinely-big-in-PH
//   international crossover song to occasionally surface. Never use the
//   word "lofi" here — that exact keyword caused the Slow Wake
//   content-mill problem before "acoustic"/"ballad"/"soul"/"indie" don't
//   have the same issue.
// This is a deliberate OPM-*biased* mix, not OPM-only — see
// spotify.js's ALT_QUERY_POOL_PAGE_OFFSETS for how the pool composition
// keeps `query` dominant over `altQuery`, and buildCandidatePool's
// `market: "PH"` for how results are scoped to what's actually available
// in the Philippines.
//
// Optional per-cell fields (see backend/services/spotify.js pickRandomTrack
// for how these are used):
// - altQuery: a second search-query variant pooled alongside `query`
//   without replacing it.
// - excludeGenericArtists: opts this mood into a heuristic filter that
//   drops candidates whose artist name is itself a generic mood/genre
//   descriptor (e.g. "Cozy Bedroom Lofi") rather than a real artist name
//   — see the GENERIC_ARTIST_KEYWORDS comment in spotify.js for why this
//   exists and its limits. Set on every mood now (not just Slow Wake):
//   named-artist `query` mostly sidesteps this by construction, but the
//   genre-descriptor `altQuery` can still surface filler the same way
//   "lofi" did, and the starvation guard already in place means this can
//   never fully empty a pool, so it's a safe universal default.
export const MOOD_MAP = {
  Morning: {
    Clear: {
      label: "Bright Start",
      query: "Rivermaya Ben&Ben APO Hiking Society Zack Tabudlo",
      altQuery: "OPM upbeat acoustic pop morning",
      excludeGenericArtists: true,
    },
    Clouds: {
      label: "Soft Focus",
      query: "Ben&Ben Sugarfree IV of Spades",
      altQuery: "OPM mellow indie folk",
      excludeGenericArtists: true,
    },
    Rain: {
      label: "Slow Wake",
      query: "Moira dela Torre This Band December Avenue",
      altQuery: "OPM rainy morning acoustic ballad",
      excludeGenericArtists: true,
    },
  },
  Afternoon: {
    Clear: {
      label: "Feel Good",
      query: "Hotdog VST & Company Zack Tabudlo",
      altQuery: "OPM summer pop funk",
      excludeGenericArtists: true,
    },
    Clouds: {
      label: "Laid Back",
      query: "IV of Spades Adie Eraserheads",
      altQuery: "OPM chill afternoon",
      excludeGenericArtists: true,
    },
    Rain: {
      label: "Cozy Focus",
      query: "Arthur Nery Sugarfree Kitchie Nadal",
      altQuery: "OPM rainy afternoon jazz soul",
      excludeGenericArtists: true,
    },
  },
  Evening: {
    Clear: {
      label: "Golden Hour",
      query: "Ben&Ben APO Hiking Society December Avenue",
      altQuery: "OPM golden hour acoustic pop",
      excludeGenericArtists: true,
    },
    Clouds: {
      label: "Reflective",
      query: "Moira dela Torre Clara Benin Barbie Almalbis",
      altQuery: "OPM singer-songwriter reflective",
      excludeGenericArtists: true,
    },
    Rain: {
      label: "Melancholic",
      query: "December Avenue This Band Moira dela Torre",
      altQuery: "OPM rainy evening indie ballad",
      excludeGenericArtists: true,
    },
  },
  Night: {
    Clear: {
      label: "Night Drive",
      query: "IV of Spades Autotelic Zack Tabudlo",
      altQuery: "OPM night drive indie electronic",
      excludeGenericArtists: true,
    },
    Clouds: {
      label: "Introspective",
      query: "Munimuni Clara Benin Cynthia Alexander",
      altQuery: "OPM introspective night acoustic",
      excludeGenericArtists: true,
    },
    Rain: {
      label: "Midnight Rain",
      query: "Arthur Nery Massiah Moira dela Torre",
      altQuery: "OPM midnight rain R&B soul",
      excludeGenericArtists: true,
    },
  },
};

// Every OpenWeatherMap `weather[0].main` value must resolve to one of the
// 3 buckets above — bucketWeather()'s `?? "Clear"` fallback is the last
// resort for anything not listed here, so nothing ever comes back
// undefined.
const WEATHER_BUCKET_ALIASES = {
  // Precipitation of any kind reads as "Rain" for mood purposes. This
  // deliberately includes Snow: its hushed, muffled quality arguably leans
  // closer to Clouds' overcast-but-dry feel than to Rain's wet/moody one —
  // either grouping is defensible, but "all precipitation together" was
  // chosen to keep the rule simple and consistent. Move "Snow" into the
  // Clouds group below if you'd rather it read as overcast.
  Rain: "Rain",
  Drizzle: "Rain",
  Thunderstorm: "Rain",
  Snow: "Rain",

  // Overcast / low-visibility, without precipitation.
  Clouds: "Clouds",
  Mist: "Clouds",
  Fog: "Clouds",
  Haze: "Clouds",
  Smoke: "Clouds",
  Dust: "Clouds",
  Sand: "Clouds",
  Ash: "Clouds",
  Squall: "Clouds",
  Tornado: "Clouds",

  Clear: "Clear",
};

export function bucketWeather(main) {
  return WEATHER_BUCKET_ALIASES[main] ?? "Clear";
}

export function bucketTimeOfDay(hour) {
  if (hour >= 5 && hour <= 11) return "Morning";
  if (hour >= 12 && hour <= 16) return "Afternoon";
  if (hour >= 17 && hour <= 20) return "Evening";
  return "Night";
}

export function getMood(weatherMain, hour) {
  const weatherBucket = bucketWeather(weatherMain);
  const timeBucket = bucketTimeOfDay(hour);
  return MOOD_MAP[timeBucket][weatherBucket];
}
