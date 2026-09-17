export interface RestaurantResult {
  name: string;
  address: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  openNow?: boolean;
  placeId: string;
}

interface GooglePlacesNearbySearchResponse {
  status: string;
  error_message?: string;
  results: Array<{
    name: string;
    vicinity?: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    price_level?: number;
    opening_hours?: { open_now?: boolean };
    place_id: string;
  }>;
}

export interface SearchRestaurantsOptions {
  keyword?: string;
  radiusMeters?: number;
  limit?: number;
}

export async function searchNearbyRestaurants(
  lat: number,
  lng: number,
  options: SearchRestaurantsOptions = {}
): Promise<RestaurantResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not set — copy .env.example to .env and fill it in.");
  }

  const { keyword, radiusMeters = 1500, limit = 5 } = options;

  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusMeters));
  url.searchParams.set("type", "restaurant");
  if (keyword) url.searchParams.set("keyword", keyword);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Places request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GooglePlacesNearbySearchResponse;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(
      `Places search failed (status: ${data.status})${
        data.error_message ? `: ${data.error_message}` : ""
      }`
    );
  }

  return data.results.slice(0, limit).map((r) => ({
    name: r.name,
    address: r.vicinity ?? r.formatted_address ?? "",
    rating: r.rating,
    userRatingsTotal: r.user_ratings_total,
    priceLevel: r.price_level,
    openNow: r.opening_hours?.open_now,
    placeId: r.place_id,
  }));
}
