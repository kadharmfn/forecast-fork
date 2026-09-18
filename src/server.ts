import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDiningRecommendation } from "./tools/getDiningRecommendation.js";
import { searchRestaurants } from "./tools/searchRestaurants.js";
import { refineRecommendation } from "./tools/refineRecommendation.js";
import { rememberPreference } from "./tools/rememberPreference.js";
import type { RestaurantResult } from "./lib/places.js";

function formatRestaurants(restaurants: RestaurantResult[]): string {
  if (restaurants.length === 0) return "No restaurants found nearby.";
  return restaurants
    .map((r) => {
      const rating = r.rating ? ` — ${r.rating}★ (${r.userRatingsTotal ?? 0} reviews)` : "";
      const open = r.openNow === true ? " — open now" : r.openNow === false ? " — closed now" : "";
      return `${r.name}${rating}${open}\n  ${r.address}`;
    })
    .join("\n\n");
}

/** Builds a fresh, fully-configured forecast-fork MCP server instance. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "forecast-fork",
    version: "0.1.0",
  });

  server.tool(
    "get_dining_recommendation",
    "Given a location (city, address, or place name), returns a dining recommendation that " +
      "reasons about live weather conditions and regional food culture together — not just a " +
      "cuisine filter. Optionally accepts free-text context (dietary needs, occasion, etc), and " +
      "can optionally chain into a nearby-restaurant search for the top recommendation. Pass a " +
      "session_id (any stable id for this conversation/customer) to apply remembered " +
      "preferences and to enable refine_recommendation as a follow-up.",
    {
      location: z
        .string()
        .describe('A place to get a recommendation for, e.g. "Seattle, WA" or "Chennai, India".'),
      context: z
        .string()
        .optional()
        .describe("Optional extra context, e.g. dietary restrictions, occasion, or time of day."),
      include_restaurants: z
        .boolean()
        .optional()
        .describe("When true, also finds actual nearby restaurants matching the top dish."),
      session_id: z
        .string()
        .optional()
        .describe(
          "Stable id for this conversation/customer. When set, remembered preferences " +
            "(remember_preference) are applied, and the result can be refined afterward with " +
            "refine_recommendation using the same id."
        ),
    },
    async ({ location, context, include_restaurants, session_id }) => {
      try {
        const result = await getDiningRecommendation({
          location,
          context,
          includeRestaurants: include_restaurants,
          sessionId: session_id,
        });

        const dishesLine = result.dishes.join(", ");
        const restaurantsBlock = result.restaurants
          ? `\n\nNearby places for ${result.dishes[0]}:\n${formatRestaurants(result.restaurants)}`
          : "";
        const sessionLine = result.sessionId
          ? `\n\n[session_id: ${result.sessionId} — pass this to remember_preference or ` +
            `refine_recommendation to continue this conversation]`
          : "";

        return {
          content: [
            {
              type: "text",
              text: `${result.reasoning}\n\n(${result.location} — ${result.weather} — ${dishesLine})${restaurantsBlock}${sessionLine}`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Couldn't get a recommendation: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "refine_recommendation",
    "Follow-up to get_dining_recommendation for the same session — use this when the customer " +
      "reacts to the last suggestion instead of asking a fresh question, e.g. \"something " +
      "cheaper\", \"not spicy\", \"I don't like that, what else?\". Reuses the session's cached " +
      "location and weather (no re-geocoding) and avoids repeating already-rejected dishes.",
    {
      session_id: z
        .string()
        .describe("The session_id returned by an earlier get_dining_recommendation call."),
      feedback: z
        .string()
        .describe('What the customer said about the last suggestion, e.g. "too heavy, something lighter".'),
      include_restaurants: z
        .boolean()
        .optional()
        .describe("When true, also finds actual nearby restaurants matching the new dish."),
    },
    async ({ session_id, feedback, include_restaurants }) => {
      try {
        const result = await refineRecommendation({
          sessionId: session_id,
          feedback,
          includeRestaurants: include_restaurants,
        });

        const dishesLine = result.dishes.join(", ");
        const restaurantsBlock = result.restaurants
          ? `\n\nNearby places for ${result.dishes[0]}:\n${formatRestaurants(result.restaurants)}`
          : "";

        return {
          content: [
            {
              type: "text",
              text: `${result.reasoning}\n\n(${result.location} — ${result.weather} — ${dishesLine})${restaurantsBlock}`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Couldn't refine the recommendation: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "remember_preference",
    "Stores a standing dietary/food preference (e.g. \"vegetarian\", \"no seafood\", \"loves " +
      "spicy food\") for a session, so future get_dining_recommendation and " +
      "refine_recommendation calls with the same session_id apply it automatically without the " +
      "customer repeating themselves.",
    {
      session_id: z.string().describe("Stable id for this conversation/customer."),
      preference: z
        .string()
        .describe('The preference to remember, e.g. "vegetarian" or "no shellfish".'),
    },
    async ({ session_id, preference }) => {
      const result = rememberPreference({ sessionId: session_id, preference });
      return {
        content: [
          {
            type: "text",
            text:
              result.preferences.length > 0
                ? `Got it — I'll remember: ${result.preferences.join("; ")}.`
                : "Got it.",
          },
        ],
      };
    }
  );

  server.tool(
    "search_restaurants",
    "Given a location and an optional keyword (e.g. a dish or cuisine from " +
      "get_dining_recommendation), returns actual nearby restaurants — name, address, rating, " +
      "price level, and whether they're currently open.",
    {
      location: z
        .string()
        .describe('A place to search near, e.g. "Seattle, WA" or "Chennai, India".'),
      keyword: z
        .string()
        .optional()
        .describe('Optional dish or cuisine to search for, e.g. "congee" or "ramen".'),
    },
    async ({ location, keyword }) => {
      try {
        const result = await searchRestaurants({ location, keyword });
        return {
          content: [
            {
              type: "text",
              text: `Near ${result.location}:\n\n${formatRestaurants(result.restaurants)}`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Couldn't search restaurants: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  return server;
}
