import { Router } from "express";
import { getMood } from "../config/moodMap.js";
import { getWeather } from "../services/weather.js";
import { pickRandomTrack } from "../services/spotify.js";

const router = Router();

function resolveCoords(query) {
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon };
  }
  return {
    lat: Number(process.env.DEFAULT_CITY_LAT),
    lon: Number(process.env.DEFAULT_CITY_LON),
  };
}

router.get("/mood", async (req, res) => {
  try {
    const { lat, lon } = resolveCoords(req.query);
    const hour = req.query.hour !== undefined
      ? Number(req.query.hour)
      : new Date().getHours();

    const weather = await getWeather(lat, lon);
    const mood = getMood(weather.condition, hour);
    const track = await pickRandomTrack(mood.query, 0, {
      altQuery: mood.altQuery,
      excludeGenericArtists: mood.excludeGenericArtists,
    });

    if (!track) {
      return res.status(404).json({ error: "No tracks found for this mood." });
    }

    res.json({ mood, weather, track });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to resolve mood." });
  }
});

router.get("/mood/reshuffle", async (req, res) => {
  try {
    const { query, offset, altQuery } = req.query;
    if (!query) {
      return res.status(400).json({ error: "Missing query parameter." });
    }

    const wrappedOffset = Number(offset ?? 0) % 100;
    const excludeGenericArtists = req.query.excludeGenericArtists === "true";
    const track = await pickRandomTrack(query, wrappedOffset, {
      altQuery,
      excludeGenericArtists,
    });

    if (!track) {
      return res.status(404).json({ error: "No tracks found for this mood." });
    }

    res.json({ track });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reshuffle track." });
  }
});

export default router;
