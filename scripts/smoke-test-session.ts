import "dotenv/config";
import { getDiningRecommendation } from "../src/tools/getDiningRecommendation.js";
import { refineRecommendation } from "../src/tools/refineRecommendation.js";
import { rememberPreference } from "../src/tools/rememberPreference.js";

const location = process.argv[2] ?? "Seattle, WA";
const sessionId = `smoke-${Date.now()}`;

rememberPreference({ sessionId, preference: "vegetarian" });

const first = await getDiningRecommendation({ location, sessionId });
console.log("Turn 1 —", first.dishes.join(", "));
console.log(first.reasoning, "\n");

const refined = await refineRecommendation({
  sessionId,
  feedback: "Something cheaper and quicker, please.",
});
console.log("Turn 2 (refined) —", refined.dishes.join(", "));
console.log(refined.reasoning, "\n");

const overlap = first.dishes.filter((d) => refined.dishes.includes(d));
console.log(
  overlap.length === 0
    ? "OK: refined dishes don't repeat the rejected ones."
    : `WARN: repeated dish(es): ${overlap.join(", ")}`
);
