import "dotenv/config";
import { searchRestaurants } from "../src/tools/searchRestaurants.js";

const location = process.argv[2] ?? "Seattle, WA";
const keyword = process.argv[3];

const result = await searchRestaurants({ location, keyword });

console.log("Location:", result.location);
console.log("\nRestaurants:");
for (const r of result.restaurants) {
  console.log(`- ${r.name} (${r.rating ?? "?"}★, ${r.userRatingsTotal ?? 0} reviews) — ${r.address}`);
}
