import { useCallback, useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

const WEATHER_ICONS = {
  Clear: "sunny",
  Clouds: "cloud",
  Rain: "rainy",
  Thunderstorm: "thunderstorm",
  Snow: "ac_unit",
  Mist: "foggy",
};

function useMood() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  const fetchMood = useCallback((lat, lon) => {
    setState((prev) => ({ ...prev, status: "loading" }));
    const hour = new Date().getHours();
    const params = new URLSearchParams({ hour });
    if (lat !== undefined && lon !== undefined) {
      params.set("lat", lat);
      params.set("lon", lon);
    }

    fetch(`${API_BASE}/api/mood?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Request failed");
        return res.json();
      })
      .then((data) => setState({ status: "ready", data, error: null }))
      .catch((error) => setState((prev) => ({ ...prev, status: "error", error })));
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      // Backend falls back to its own default city when no coords are sent.
      fetchMood();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => fetchMood(position.coords.latitude, position.coords.longitude),
      () => fetchMood()
    );
  }, [fetchMood]);

  useEffect(() => {
    locate();
  }, [locate]);

  return [state, setState, locate];
}

// Spotify's web player caps unauthenticated playback at ~15-30s before it
// interrupts to ask you to log in. Deep-linking into the native app (desktop
// or mobile) skips that entirely and plays the full track through the user's
// own Spotify session. If the app isn't installed, the URI silently no-ops,
// so we fall back to the web player after a short delay if the tab never
// lost focus (a rough but standard signal that the app didn't take over).
function openInSpotify(track) {
  let appTookOver = false;

  function onVisibilityChange() {
    if (document.hidden) appTookOver = true;
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  window.location.href = `spotify:track:${track.id}`;

  setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (!appTookOver) {
      window.open(track.spotifyUrl, "_blank", "noopener,noreferrer");
    }
  }, 1500);
}

function App() {
  const [state, setState, locate] = useMood();
  const [reshuffling, setReshuffling] = useState(false);

  function handleDifferentSong() {
    if (!state.data) return;
    setReshuffling(true);

    const nextOffset = ((state.data.offset ?? 0) + 20) % 100;
    const params = new URLSearchParams({
      query: state.data.mood.query,
      offset: nextOffset,
    });
    if (state.data.mood.altQuery) {
      params.set("altQuery", state.data.mood.altQuery);
    }
    if (state.data.mood.excludeGenericArtists) {
      params.set("excludeGenericArtists", "true");
    }

    fetch(`${API_BASE}/api/mood/reshuffle?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Request failed");
        return res.json();
      })
      .then(({ track }) =>
        setState((prev) => ({
          ...prev,
          data: { ...prev.data, track, offset: nextOffset },
        }))
      )
      .catch((error) => setState((prev) => ({ ...prev, status: "error", error })))
      .finally(() => setReshuffling(false));
  }

  const isLoading = state.status === "loading";
  const weather = state.data?.weather;
  const mood = state.data?.mood;
  const track = state.data?.track;

  return (
    <div className="relative flex flex-col h-[100dvh] w-full overflow-hidden bg-background text-on-background">
      <div className="ambient-glow-bg" />

      <header className="flex justify-center items-center gap-gutter py-unit px-margin-desktop w-full max-w-container-max-width mx-auto fixed top-0 left-0 right-0 z-50 bg-transparent">
        {weather && (
          <div className="flex items-center gap-4 text-secondary font-label-md text-label-md">
            <span className="material-symbols-outlined text-[18px]">location_on</span>
            <span>
              {weather.city} • {weather.tempC}°C
            </span>
            <span className="material-symbols-outlined text-[18px]">
              {WEATHER_ICONS[weather.condition] ?? "cloud"}
            </span>
          </div>
        )}
      </header>

      <main className="flex flex-col items-center justify-center pt-20 pb-20 md:pt-24 md:pb-16 px-margin-mobile md:px-margin-desktop h-[100dvh] overflow-hidden">
        <div className="max-w-container-max-width w-full flex flex-col items-center space-y-6">
          <div className="text-center space-y-6">
            <h1 className="font-display text-display tracking-tighter text-on-background">
              Moodify
            </h1>
            {isLoading && !track && (
              <p className="font-body-md text-body-md text-secondary">Reading the room…</p>
            )}
            {state.status === "error" && (
              <p className="font-body-md text-body-md text-secondary">
                Couldn't read the room.{" "}
                <button
                  className="text-primary underline underline-offset-2"
                  onClick={locate}
                >
                  Try again
                </button>
              </p>
            )}
          </div>

          {track && (
            <section
              className={`w-full flex flex-col items-center space-y-6 transition-all duration-500 ${
                isLoading ? "opacity-40 blur-sm scale-[0.98]" : "opacity-100 blur-0 scale-100"
              }`}
            >
              <div className="relative group">
                <div className="w-[min(320px,34vh)] h-[min(320px,34vh)] md:w-[min(380px,40vh)] md:h-[min(380px,40vh)] rounded-lg overflow-hidden album-glow transition-transform duration-500 hover:scale-[1.01]">
                  {track.albumArtUrl && (
                    <img
                      className="w-full h-full object-cover"
                      src={track.albumArtUrl}
                      alt={track.name}
                    />
                  )}
                </div>
              </div>

              <div className="text-center space-y-2">
                <p className="font-label-sm text-label-sm text-primary uppercase tracking-wide">
                  {mood.label}
                </p>
                <h2 className="font-headline-lg text-headline-lg text-on-background">
                  {track.name}
                </h2>
                <p className="font-body-lg text-body-lg text-secondary">{track.artists}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                <a
                  className="px-8 py-4 bg-primary-container text-on-primary-fixed font-label-md text-label-md rounded-full flex items-center justify-center gap-3 transition-all hover:bg-primary-fixed-dim cursor-pointer"
                  href={track.spotifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    openInSpotify(track);
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    play_circle
                  </span>
                  Play on Spotify
                </a>
                <button
                  className="px-8 py-4 border border-outline-variant text-on-background font-label-md text-label-md rounded-full bg-surface-container-low/30 backdrop-blur-md flex items-center justify-center gap-3 transition-all hover:bg-surface-container-high disabled:opacity-60"
                  onClick={handleDifferentSong}
                  disabled={reshuffling}
                >
                  <span className="material-symbols-outlined">refresh</span>
                  {reshuffling ? "Finding another…" : "Find another song"}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="flex flex-row flex-wrap justify-between items-center gap-2 gap-y-1 py-4 w-full max-w-container-max-width mx-auto px-margin-mobile md:px-margin-desktop bg-transparent border-t border-transparent absolute bottom-0 left-0 right-0">
        <p className="font-label-sm text-label-sm text-secondary">Weather + time, one song at a time.</p>
        <a
          className="font-label-sm text-label-sm text-secondary hover:text-primary transition-colors"
          href="https://developer.spotify.com/documentation/web-api"
          target="_blank"
          rel="noreferrer"
        >
          Spotify API
        </a>
      </footer>
    </div>
  );
}

export default App;
