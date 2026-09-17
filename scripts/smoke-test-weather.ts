import "dotenv/config";
import { geocodeLocation } from "../src/lib/geocode.js";
import { getCurrentWeather } from "../src/lib/weather.js";

const location = process.argv[2] ?? "Seattle, WA";

const geocoded = await geocodeLocation(location);
console.log("Geocoded:", geocoded);

const weather = await getCurrentWeather(geocoded.lat, geocoded.lng);
console.log("\nWeather:", weather);
