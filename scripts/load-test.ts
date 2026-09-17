// Measures real latency, success rate, and (for Bedrock) token usage across a spread of regions.
import "dotenv/config";
import { geocodeLocation } from "../src/lib/geocode.js";
import { getCurrentWeather } from "../src/lib/weather.js";
import { searchNearbyRestaurants } from "../src/lib/places.js";
import { reasonAboutDining } from "../src/lib/bedrock.js";

// Rough published Bedrock Claude Sonnet-class pricing — verify against the current Bedrock
// pricing page for the exact model in use. Used only to turn real observed token counts into an
// estimated dollar figure; the token counts themselves are measured, not guessed.
const INPUT_COST_PER_1M = 3.0;
const OUTPUT_COST_PER_1M = 15.0;

// Rough published Google Maps Platform pricing (verify current rates) — used only for the
// pre-run cost preview, not billed against actual usage tracking.
const GEOCODE_COST_PER_CALL = 0.005;
const PLACES_COST_PER_CALL = 0.032;

// Stratified by climate/region, not just continent, so the sample is more useful for a paper
// than "one city per continent": tropical, arid, cold/arctic, temperate, and southern-hemisphere
// (opposite season) are all represented.
const LOCATIONS = [
  // Original 8
  "Chennai, India",
  "Seattle, WA",
  "Tokyo, Japan",
  "São Paulo, Brazil",
  "Lagos, Nigeria",
  "Reykjavik, Iceland",
  "Sydney, Australia",
  "Cairo, Egypt",
  // Tropical / equatorial
  "Mumbai, India",
  "Bangkok, Thailand",
  "Singapore",
  "Jakarta, Indonesia",
  "Manila, Philippines",
  // Arid / desert
  "Dubai, UAE",
  "Riyadh, Saudi Arabia",
  "Marrakech, Morocco",
  // Cold / high-latitude
  "Moscow, Russia",
  "Oslo, Norway",
  "Anchorage, AK",
  // Temperate
  "London, UK",
  "Paris, France",
  "Toronto, Canada",
  "New York, NY",
  "Seoul, South Korea",
  "Beijing, China",
  // Southern hemisphere (opposite season from the northern-hemisphere entries above)
  "Buenos Aires, Argentina",
  "Cape Town, South Africa",
  "Santiago, Chile",
  "Lima, Peru",
  "Auckland, New Zealand",
];

interface StageResult {
  ok: boolean;
  ms: number;
  error?: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result?: T } & StageResult> {
  const start = performance.now();
  try {
    const result = await fn();
    return { ok: true, ms: performance.now() - start, result };
  } catch (error) {
    return { ok: false, ms: performance.now() - start, error: (error as Error).message };
  }
}

function summarize(label: string, results: StageResult[]) {
  const successes = results.filter((r) => r.ok);
  const successRate = ((successes.length / results.length) * 100).toFixed(0);
  const times = successes.map((r) => r.ms);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const min = times.length ? Math.min(...times) : 0;
  const max = times.length ? Math.max(...times) : 0;
  console.log(
    `${label.padEnd(14)} success ${successRate}% (${successes.length}/${results.length})  ` +
      `avg ${avg.toFixed(0)}ms  min ${min.toFixed(0)}ms  max ${max.toFixed(0)}ms`
  );
}

const estGeocodeCost = LOCATIONS.length * GEOCODE_COST_PER_CALL;
const estPlacesCost = LOCATIONS.length * PLACES_COST_PER_CALL;
const estBedrockCost = LOCATIONS.length * 0.0075; // ballpark from prior measured run
console.log(
  `Running ${LOCATIONS.length} locations. Estimated cost: ` +
    `Google ~$${(estGeocodeCost + estPlacesCost).toFixed(2)} (well under the $200/mo free credit), ` +
    `Bedrock ~$${estBedrockCost.toFixed(2)} (no free tier, billed from the first call).\n`
);

const geocodeResults: StageResult[] = [];
const weatherResults: StageResult[] = [];
const placesResults: StageResult[] = [];
const bedrockResults: StageResult[] = [];
const tokenUsages: { inputTokens: number; outputTokens: number }[] = [];

for (const location of LOCATIONS) {
  const geo = await timed(() => geocodeLocation(location));
  geocodeResults.push(geo);
  console.log(
    `[${location}] geocode: ${geo.ok ? `ok (${geo.ms.toFixed(0)}ms)` : `FAILED (${geo.error})`}`
  );

  if (!geo.ok || !geo.result) continue;
  const { lat, lng } = geo.result;

  const weather = await timed(() => getCurrentWeather(lat, lng));
  weatherResults.push(weather);
  console.log(
    `[${location}] weather:  ${weather.ok ? `ok (${weather.ms.toFixed(0)}ms)` : `FAILED (${weather.error})`}`
  );

  const places = await timed(() => searchNearbyRestaurants(lat, lng));
  placesResults.push(places);
  console.log(
    `[${location}] places:   ${places.ok ? `ok (${places.ms.toFixed(0)}ms)` : `FAILED (${places.error})`}`
  );

  if (!weather.ok || !weather.result) continue;

  const bedrock = await timed(() =>
    reasonAboutDining({ location: geo.result!, weather: weather.result! })
  );
  bedrockResults.push(bedrock);
  if (bedrock.ok && bedrock.result) {
    tokenUsages.push(bedrock.result.usage);
    console.log(
      `[${location}] bedrock:  ok (${bedrock.ms.toFixed(0)}ms, ${bedrock.result.usage.inputTokens} in / ${bedrock.result.usage.outputTokens} out tok) — ${bedrock.result.dishes.join(", ")}`
    );
  } else {
    console.log(`[${location}] bedrock:  FAILED (${bedrock.error})`);
  }
}

console.log(`\n=== Summary across ${LOCATIONS.length} regions ===`);
summarize("geocode", geocodeResults);
summarize("weather", weatherResults);
summarize("places", placesResults);
summarize("bedrock", bedrockResults);

if (tokenUsages.length > 0) {
  const avgInput = tokenUsages.reduce((a, u) => a + u.inputTokens, 0) / tokenUsages.length;
  const avgOutput = tokenUsages.reduce((a, u) => a + u.outputTokens, 0) / tokenUsages.length;
  const avgCost =
    (avgInput / 1_000_000) * INPUT_COST_PER_1M + (avgOutput / 1_000_000) * OUTPUT_COST_PER_1M;
  console.log(
    `\nBedrock tokens (measured): avg ${avgInput.toFixed(0)} in / ${avgOutput.toFixed(0)} out`
  );
  console.log(
    `Estimated cost/query: $${avgCost.toFixed(5)} ` +
      `(using $${INPUT_COST_PER_1M}/1M in, $${OUTPUT_COST_PER_1M}/1M out — verify against current Bedrock pricing)`
  );
}
