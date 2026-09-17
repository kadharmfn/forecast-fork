import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { GeocodedLocation } from "./geocode.js";
import type { CurrentWeather } from "./weather.js";

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const WEATHER_AWARE_SYSTEM_PROMPT = `You are a dining companion who deeply understands regional \
food culture. Given a place and the current weather there, recommend what someone should eat \
right now.

Reason like a local, not a filter. Don't just match keywords to cuisine tags — think about \
what's actually culturally comforting or appropriate: what do people in this region reach for \
when it's this cold, this hot, this rainy, or this humid? Consider regional comfort foods, \
seasonal dishes, street food vs. sit-down norms, how the near-term forecast might affect the \
choice (e.g. something quick if rain is coming), and how weather shifts appetite (e.g. craving \
something hot and brothy on a cold damp day, something light and cold on a hot day).

Do not just list generic categories like "soup" — be specific to the region's cuisine. Explain \
your reasoning in a warm, conversational tone suitable for a voice assistant to read aloud.`;

// Deliberately generic — used as a "weather-blind" baseline for comparison, roughly what a
// rule-based / cuisine-filter recommender would produce.
const BASELINE_SYSTEM_PROMPT = `You are a dining recommendation assistant. Given a place, \
recommend what someone should eat there — 1-3 popular local dishes or dish categories for this \
region. Explain your reasoning in a warm, conversational tone suitable for a voice assistant to \
read aloud.`;

const DINING_RECOMMENDATION_TOOL = {
  name: "dining_recommendation",
  description: "Return a structured dining recommendation.",
  input_schema: {
    type: "object",
    properties: {
      dishes: {
        type: "array",
        items: { type: "string" },
        description: "1-3 specific dishes or dish categories, most-recommended first.",
      },
      primary_keyword: {
        type: "string",
        description:
          "The single best short search keyword for finding a restaurant serving the top " +
          'recommendation, e.g. "ramen" or "congee" — used to search nearby places.',
      },
      reasoning: {
        type: "string",
        description:
          "2-4 sentence explanation of the recommendation, phrased for a voice assistant to " +
          "read aloud.",
      },
    },
    required: ["dishes", "primary_keyword", "reasoning"],
  },
} as const;

export interface DiningRecommendation {
  dishes: string[];
  primaryKeyword: string;
  reasoning: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface DiningReasoningInput {
  location: GeocodedLocation;
  weather: CurrentWeather;
  context?: string;
  /** Set false to get a weather-blind baseline recommendation, for comparison/demo purposes. */
  includeWeather?: boolean;
}

export async function reasonAboutDining(
  input: DiningReasoningInput
): Promise<DiningRecommendation> {
  const { location, weather, context, includeWeather = true } = input;

  const locationLine = `Location: ${location.formattedAddress}${
    location.region ? ` (${location.region}, ${location.country ?? ""})` : ""
  }`;
  const weatherLine = includeWeather
    ? `Current weather: ${weather.description}, ${weather.temperatureC}°C (feels like ${weather.apparentTemperatureC}°C), ${weather.precipitationMm}mm precipitation, ${weather.isDay ? "daytime" : "nighttime"}. Near-term: ${weather.nearTermTrend}.`
    : "";
  const contextLine = context ? `Additional context from the requester: ${context}` : "";

  const userPrompt = [locationLine, weatherLine, contextLine, "What should I eat right now?"]
    .filter(Boolean)
    .join("\n");

  const modelId = process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-sonnet-4-6-v1:0";

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
      system: includeWeather ? WEATHER_AWARE_SYSTEM_PROMPT : BASELINE_SYSTEM_PROMPT,
      tools: [DINING_RECOMMENDATION_TOOL],
      tool_choice: { type: "tool", name: DINING_RECOMMENDATION_TOOL.name },
      messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
    }),
  });

  const response = await client.send(command);
  const payload = JSON.parse(new TextDecoder().decode(response.body));

  const toolUse = payload?.content?.find(
    (block: { type: string }) => block.type === "tool_use"
  ) as { input?: { dishes?: string[]; primary_keyword?: string; reasoning?: string } } | undefined;

  if (!toolUse?.input) {
    throw new Error("Bedrock response did not contain a dining_recommendation tool call.");
  }

  const { dishes, primary_keyword, reasoning } = toolUse.input;
  if (!dishes || !primary_keyword || !reasoning) {
    throw new Error("Bedrock's dining_recommendation call was missing required fields.");
  }

  return {
    dishes,
    primaryKeyword: primary_keyword,
    reasoning,
    usage: {
      inputTokens: payload?.usage?.input_tokens ?? 0,
      outputTokens: payload?.usage?.output_tokens ?? 0,
    },
  };
}
