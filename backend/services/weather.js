export async function getWeather(lat, lon) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    appid: process.env.OPENWEATHER_API_KEY,
    units: "metric",
  });

  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?${params}`
  );

  if (!res.ok) {
    throw new Error(`OpenWeatherMap request failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    condition: data.weather?.[0]?.main ?? "Clear",
    tempC: Math.round(data.main?.temp ?? 0),
    city: data.name ?? "Unknown",
  };
}
