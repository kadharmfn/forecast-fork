import "dotenv/config";
import { getDiningRecommendation } from "../src/tools/getDiningRecommendation.js";

const location = process.argv[2] ?? "Seattle, WA";
const context = process.argv[3];

const result = await getDiningRecommendation({ location, context, includeRestaurants: true });

console.log("Location:", result.location);
console.log("Weather:", result.weather);
console.log("Dishes:", result.dishes.join(", "));
console.log("\nReasoning:\n" + result.reasoning);

if (result.restaurants) {
  console.log(`\nNearby places for "${result.dishes[0]}":`);
  for (const r of result.restaurants) {
    console.log(`- ${r.name} (${r.rating ?? "?"}★) — ${r.address}`);
  }
}
