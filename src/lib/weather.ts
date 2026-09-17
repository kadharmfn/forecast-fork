export interface CurrentWeather {
  temperatureC: number;
  apparentTemperatureC: number;
  precipitationMm: number;
  weatherCode: number;
  description: string;
  isDay: boolean;
  /** Plain-language summary of how conditions are trending over the next few hours. */
  nearTermTrend: string;
}

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    is_day: number;
  };
  hourly: {
    time: string[];
    precipitation_probability: number[];
    weather_code: number[];
  };
}

// WMO Weather interpretation codes (open-meteo.com/en/docs)
const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  56: "light freezing drizzle",
  57: "dense freezing drizzle",
  61: "slight rain",
  63: "moderate rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "heavy freezing rain",
  71: "slight snow fall",
  73: "moderate snow fall",
  75: "heavy snow fall",
  77: "snow grains",
  80: "slight rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  85: "slight snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with slight hail",
  99: "thunderstorm with heavy hail",
};

function summarizeNearTermTrend(data: OpenMeteoResponse): string {
  const { hourly, current } = data;
  const currentIndex = hourly.time.findIndex((t) => t >= current.time);
  if (currentIndex === -1) return "no near-term forecast available";

  const upcomingProbabilities = hourly.precipitation_probability.slice(
    currentIndex + 1,
    currentIndex + 4
  );
  if (upcomingProbabilities.length === 0) return "no near-term forecast available";

  const currentProbability = hourly.precipitation_probability[currentIndex] ?? 0;
  const maxUpcomingProbability = Math.max(...upcomingProbabilities);

  if (maxUpcomingProbability >= 50 && currentProbability < 50) {
    return "rain likely within the next few hours";
  }
  if (currentProbability >= 50 && maxUpcomingProbability < 30) {
    return "should clear up within a few hours";
  }
  if (currentProbability >= 50 && maxUpcomingProbability >= 50) {
    return "rain expected to continue for the next few hours";
  }
  return "conditions expected to stay fairly steady for the next few hours";
}

export async function getCurrentWeather(lat: number, lng: number): Promise<CurrentWeather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,precipitation,weather_code,is_day"
  );
  url.searchParams.set("hourly", "precipitation_probability,weather_code");
  url.searchParams.set("forecast_hours", "6");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as OpenMeteoResponse;
  const { temperature_2m, apparent_temperature, precipitation, weather_code, is_day } =
    data.current;

  return {
    temperatureC: temperature_2m,
    apparentTemperatureC: apparent_temperature,
    precipitationMm: precipitation,
    weatherCode: weather_code,
    description: WEATHER_CODE_DESCRIPTIONS[weather_code] ?? "unknown conditions",
    isDay: is_day === 1,
    nearTermTrend: summarizeNearTermTrend(data),
  };
}
