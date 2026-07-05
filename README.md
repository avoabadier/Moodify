# Moodify

Checks the weather and time where you are, picks a mood, and hands you one Spotify song to play. No login, no playlists.

## Status: experimental, and honestly kind of vibe-coded

This was built fast and conversationally with Claude Code, not from a fully-planned upfront design — most of the real architecture (the search/pooling pipeline, the per-mood query tuning, the UI) came out of shipping something, running it against the live Spotify API, seeing what broke or felt off, and fixing that specific thing, several times over. That process worked, but it's worth being upfront about what it means in practice:

- Backend tuning constants (search pool depth, per-artist caps, per-mood queries) are derived from a handful of live test runs, not exhaustively validated across every condition.
- This app has run into real, undocumented Spotify quota restrictions along the way (no `popularity` field on any endpoint, a hard `limit<=10` cap on Search, a 403 on batch track lookup) — the design bent around these as they were discovered, rather than being planned for from day one.
- Rate limiting isn't handled gracefully. A burst of requests can get this app's Spotify credentials locked out for hours — this has actually happened once during development.
- The song-picking pipeline is decent, not bulletproof — occasional off-mood, generic-filler, or non-Filipino picks still slip through despite several rounds of tuning.
- No automated tests, no CI, no deployment. It runs on localhost and has been verified by hand (curl, headless-browser screenshots), not by a test suite.

None of that means don't use it — it means "done" here means *working and enjoyable to use*, not hardened or production-ready. Treat it like a personal project someone iterated on quickly, because that's exactly what it is.

## Setup

```
cd backend && npm install && cp .env.example .env   # fill in SPOTIFY_CLIENT_ID/SECRET + OPENWEATHER_API_KEY
cd frontend && npm install && cp .env.example .env
```

## Run

```
cd backend && npm run dev     # http://localhost:3001
cd frontend && npm run dev    # http://localhost:5173
```
