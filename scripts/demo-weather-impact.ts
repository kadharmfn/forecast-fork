// Demo script: shows the actual contribution of the project side-by-side — the same location
// reasoned about with live weather vs. without it (a generic, weather-blind baseline similar to
// what a rule-based/cuisine-filter recommender would produce).
import "dotenv/config";
import { geocodeLocation } from "../src/lib/geocode.js";
import { getCurrentWeather } from "../src/lib/weather.js";
import { reasonAboutDining } from "../src/lib/bedrock.js";

const location = process.argv[2] ?? "Seattle, WA";

const geocoded = await geocodeLocation(location);
const weather = await getCurrentWeather(geocoded.lat, geocoded.lng);

const [withWeather, withoutWeather] = await Promise.all([
  reasonAboutDining({ location: geocoded, weather, includeWeather: true }),
  reasonAboutDining({ location: geocoded, weather, includeWeather: false }),
]);

console.log(`Location: ${geocoded.formattedAddress}`);
console.log(
  `Weather:  ${weather.description}, ${weather.temperatureC}°C (${weather.nearTermTrend})`
);

console.log("\n=== Weather-aware (forecast-fork) ===");
console.log("Dishes:", withWeather.dishes.join(", "));
console.log(withWeather.reasoning);

console.log("\n=== Weather-blind baseline ===");
console.log("Dishes:", withoutWeather.dishes.join(", "));
console.log(withoutWeather.reasoning);
