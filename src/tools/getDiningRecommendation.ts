import { geocodeLocation } from "../lib/geocode.js";
import { getCurrentWeather } from "../lib/weather.js";
import { reasonAboutDining } from "../lib/bedrock.js";
import { searchNearbyRestaurants, type RestaurantResult } from "../lib/places.js";

export interface DiningRecommendationArgs {
  location: string;
  context?: string;
  /** When true, also searches nearby restaurants matching the top dish recommendation. */
  includeRestaurants?: boolean;
}

export interface DiningRecommendationResult {
  location: string;
  weather: string;
  dishes: string[];
  reasoning: string;
  restaurants?: RestaurantResult[];
}

export async function getDiningRecommendation(
  args: DiningRecommendationArgs
): Promise<DiningRecommendationResult> {
  const geocoded = await geocodeLocation(args.location);
  const weather = await getCurrentWeather(geocoded.lat, geocoded.lng);
  const recommendation = await reasonAboutDining({
    location: geocoded,
    weather,
    context: args.context,
  });

  const restaurants = args.includeRestaurants
    ? await searchNearbyRestaurants(geocoded.lat, geocoded.lng, {
        keyword: recommendation.primaryKeyword,
      })
    : undefined;

  return {
    location: geocoded.formattedAddress,
    weather: `${weather.description}, ${weather.temperatureC}°C (${weather.nearTermTrend})`,
    dishes: recommendation.dishes,
    reasoning: recommendation.reasoning,
    restaurants,
  };
}
