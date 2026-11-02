// 天気予報。Open-Meteo(APIキー不要・無料)から取得。緯度経度は設定(settings.ts)。未設定ならnull
const REVALIDATE_SECONDS = 60 * 60; // 1時間ごとに更新

export type Weather = {
  currentTemp: number;
  currentCode: number; // WMO weather code
};

/** WMOの天気コード → 表示名のi18nキー(weather.*) */
export function weatherKey(code: number): string {
  if (code === 0) return "weather.clear";
  if (code === 1) return "weather.sunny";
  if (code === 2) return "weather.partly";
  if (code === 3) return "weather.cloudy";
  if (code === 45 || code === 48) return "weather.fog";
  if (code >= 51 && code <= 57) return "weather.drizzle";
  if (code >= 61 && code <= 67) return "weather.rain";
  if (code >= 71 && code <= 77) return "weather.snow";
  if (code >= 80 && code <= 82) return "weather.showers";
  if (code === 85 || code === 86) return "weather.snowShowers";
  if (code >= 95) return "weather.thunder";
  return "weather.cloudy";
}

/** WMOの天気コード → オフィスの窓の天気(晴れ・くもり・雨・雪)。霧はくもり、雷雨は雨 */
export function weatherKind(code: number): "sunny" | "cloudy" | "rain" | "snow" {
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  return code >= 3 ? "cloudy" : "sunny";
}

export async function fetchWeather(place: { lat: number; lon: number } | null): Promise<Weather | null> {
  if (!place) return null;
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(place.lat)}&longitude=${encodeURIComponent(place.lon)}` +
    "&current=temperature_2m,weather_code&timezone=auto&forecast_days=1";

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "virtual-office" },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const c = (await res.json()).current;
    if (typeof c?.temperature_2m !== "number" || typeof c?.weather_code !== "number") return null;
    return { currentTemp: Math.round(c.temperature_2m), currentCode: c.weather_code };
  } catch {
    return null;
  }
}
