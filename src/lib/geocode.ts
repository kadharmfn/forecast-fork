export interface GeocodedLocation {
  formattedAddress: string;
  lat: number;
  lng: number;
  city?: string;
  region?: string;
  country?: string;
}

interface GoogleGeocodeResponse {
  status: string;
  results: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
    address_components: Array<{ long_name: string; types: string[] }>;
  }>;
}

function pickComponent(
  components: GoogleGeocodeResponse["results"][number]["address_components"],
  type: string
): string | undefined {
  return components.find((c) => c.types.includes(type))?.long_name;
}

export async function geocodeLocation(location: string): Promise<GeocodedLocation> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not set — copy .env.example to .env and fill it in.");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", location);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Geocoding request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GoogleGeocodeResponse;
  if (data.status !== "OK" || data.results.length === 0) {
    throw new Error(`Could not geocode "${location}" (status: ${data.status})`);
  }

  const result = data.results[0];
  const { lat, lng } = result.geometry.location;

  return {
    formattedAddress: result.formatted_address,
    lat,
    lng,
    city:
      pickComponent(result.address_components, "locality") ??
      pickComponent(result.address_components, "postal_town"),
    region: pickComponent(result.address_components, "administrative_area_level_1"),
    country: pickComponent(result.address_components, "country"),
  };
}
