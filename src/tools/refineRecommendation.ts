import { reasonAboutDining } from "../lib/bedrock.js";
import { searchNearbyRestaurants, type RestaurantResult } from "../lib/places.js";
import { getSession, touchSession } from "../lib/session.js";

export interface RefineRecommendationArgs {
  sessionId: string;
  /** What the customer said about the last suggestion, e.g. "something cheaper", "not spicy". */
  feedback: string;
  includeRestaurants?: boolean;
}

export interface RefineRecommendationResult {
  location: string;
  weather: string;
  dishes: string[];
  reasoning: string;
  restaurants?: RestaurantResult[];
}

export async function refineRecommendation(
  args: RefineRecommendationArgs
): Promise<RefineRecommendationResult> {
  const session = getSession(args.sessionId);
  if (!session?.lastLocation || !session.lastWeather || !session.lastDishes) {
    throw new Error(
      "No prior recommendation found for this session — call get_dining_recommendation with " +
        "this session_id first."
    );
  }

  session.rejectedDishes.push(...session.lastDishes);

  const contextParts = [
    session.preferences.length > 0
      ? `Standing preferences from this customer: ${session.preferences.join("; ")}.`
      : "",
    `They already rejected this suggestion: ${session.lastDishes.join(", ")}. Their feedback: ` +
      `"${args.feedback}".`,
    `Do not suggest any of these again: ${session.rejectedDishes.join(", ")}.`,
  ].filter(Boolean);

  const recommendation = await reasonAboutDining({
    location: session.lastLocation,
    weather: session.lastWeather,
    context: contextParts.join("\n"),
  });

  session.lastDishes = recommendation.dishes;
  touchSession(session);

  const restaurants = args.includeRestaurants
    ? await searchNearbyRestaurants(session.lastLocation.lat, session.lastLocation.lng, {
        keyword: recommendation.primaryKeyword,
      })
    : undefined;

  return {
    location: session.lastLocation.formattedAddress,
    weather: `${session.lastWeather.description}, ${session.lastWeather.temperatureC}°C (${session.lastWeather.nearTermTrend})`,
    dishes: recommendation.dishes,
    reasoning: recommendation.reasoning,
    restaurants,
  };
}
