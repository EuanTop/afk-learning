import { Type } from "@sinclair/typebox";

type WeatherToolDefinition = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (_toolCallId: string, rawParams: Record<string, unknown>) => Promise<{
    type: "text";
    text: string;
  }>;
};

function readNumberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" ? value : fallback;
}

const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function createWeatherTool(): WeatherToolDefinition {
  return {
    name: "get_weather",
    label: "Get Weather",
    description:
      "Fetch today's weather for the learner's location. Use this to add environmental context to the daily letter.",
    parameters: Type.Object(
      {
        latitude: Type.Optional(
          Type.Number({ description: "Latitude (default: 39.9 Beijing)." }),
        ),
        longitude: Type.Optional(
          Type.Number({ description: "Longitude (default: 116.4 Beijing)." }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const lat = readNumberParam(rawParams, "latitude", 39.9);
      const lon = readNumberParam(rawParams, "longitude", 116.4);

      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lon));
      url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean");
      url.searchParams.set("timezone", "Asia/Shanghai");
      url.searchParams.set("forecast_days", "1");

      try {
        const response = await fetch(url.toString());
        if (!response.ok) {
          return {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: `Weather API returned ${response.status}` }),
          };
        }

        const data = (await response.json()) as {
          daily?: {
            weather_code?: number[];
            temperature_2m_max?: number[];
            temperature_2m_min?: number[];
            relative_humidity_2m_mean?: number[];
          };
        };

        const daily = data.daily;
        const weatherCode = daily?.weather_code?.[0] ?? 0;
        const condition = WMO_CODES[weatherCode] ?? "Unknown";
        const tempHigh = daily?.temperature_2m_max?.[0] ?? null;
        const tempLow = daily?.temperature_2m_min?.[0] ?? null;
        const humidity = daily?.relative_humidity_2m_mean?.[0] ?? null;

        return {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            condition,
            weatherCode,
            tempHigh,
            tempLow,
            humidity,
            location: { latitude: lat, longitude: lon },
          }),
        };
      } catch (err) {
        return {
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : "Weather fetch failed",
          }),
        };
      }
    },
  };
}
