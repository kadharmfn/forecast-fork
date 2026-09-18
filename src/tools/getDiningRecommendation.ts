import { geocodeLocation } from "../lib/geocode.js";
import { getCurrentWeather } from "../lib/weather.js";
import { reasonAboutDining } from "../lib/bedrock.js";
import { searchNearbyRestaurants, type RestaurantResult } from "../lib/places.js";
import { getOrCreateSession, touchSession } from "../lib/session.js";

export interface DiningRecommendationArgs {
  location: string;
  context?: string;
  /** When true, also searches nearby restaurants matching the top dish recommendation. */
  includeRestaurants?: boolean;
  /** Conversation/session identifier. When set, standing preferences are applied and the
   * recommendation is cached so refine_recommendation can build on it. */
  sessionId?: string;
}

export interface DiningRecommendationResult {
  location: string;
  weather: string;
  dishes: string[];
  reasoning: string;
  restaurants?: RestaurantResult[];
  sessionId?: string;
}

export async function getDiningRecommendation(
  args: DiningRecommendationArgs
): Promise<DiningRecommendationResult> {
  const geocoded = await geocodeLocation(args.location);
  const weather = await getCurrentWeather(geocoded.lat, geocoded.lng);

  const session = args.sessionId ? getOrCreateSession(args.sessionId) : undefined;
  const contextParts = [
    session && session.preferences.length > 0
      ? `Standing preferences from this customer: ${session.preferences.join("; ")}.`
      : "",
    args.context ?? "",
  ].filter(Boolean);

  const recommendation = await reasonAboutDining({
    location: geocoded,
    weather,
    context: contextParts.join("\n") || undefined,
  });

  if (session) {
    session.lastLocation = geocoded;
    session.lastWeather = weather;
    session.lastDishes = recommendation.dishes;
    session.rejectedDishes = [];
    touchSession(session);
  }

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
    sessionId: session?.id,
  };
}
