import { geocodeLocation } from "../lib/geocode.js";
import { searchNearbyRestaurants, type RestaurantResult } from "../lib/places.js";

export interface SearchRestaurantsArgs {
  location: string;
  keyword?: string;
}

export interface SearchRestaurantsResult {
  location: string;
  restaurants: RestaurantResult[];
}

export async function searchRestaurants(
  args: SearchRestaurantsArgs
): Promise<SearchRestaurantsResult> {
  const geocoded = await geocodeLocation(args.location);
  const restaurants = await searchNearbyRestaurants(geocoded.lat, geocoded.lng, {
    keyword: args.keyword,
  });

  return {
    location: geocoded.formattedAddress,
    restaurants,
  };
}
