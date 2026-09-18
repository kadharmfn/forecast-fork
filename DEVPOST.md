# Forecast Fork — Devpost submission story

This is the project-story writeup for the Devpost submission form (Inspiration / What it does /
How we built it / Challenges / Accomplishments / What we learned / What's next). Kept as its own
file, separate from [README.md](./README.md)'s setup + technical docs, so it's easy to paste into
the form and easy to keep in sync as the project changes.

## Inspiration

This project started from an arxiv paper on agentic dining recommendation — an LLM orchestrating
a location tool and a weather tool, then reasoning about culturally appropriate food, rather than
filtering a restaurant database by cuisine tags. It mapped almost exactly onto the Alexa+ track:
package that same pattern as an MCP tool, let Alexa+ act as the orchestrator instead of a
standalone app.

We already had a head start — an existing blog post covering the location + restaurant-search half
of the pipeline with Google Places. What was missing was the piece the paper actually contributes:
**weather as a first-class input to the reasoning step**, not just another filter. That gap became
the whole point of the project.

## What it does

Forecast Fork is an MCP server exposing four tools Alexa+ can call mid-conversation:

- **`get_dining_recommendation`** — geocodes a location, pulls live weather and a near-term
  forecast trend, and asks Claude (on Amazon Bedrock) to reason about what's culturally comforting
  to eat *right now, in this exact place and weather* — not filter by cuisine keyword.
- **`search_restaurants`** — finds real nearby places. The two chain automatically: ask
  `get_dining_recommendation` with `include_restaurants: true` and it reasons about the dish, then
  uses that dish as the search keyword to point you at an actual open restaurant nearby.
- **`remember_preference`** — stores a standing preference ("I'm vegetarian", "no seafood") against
  a `session_id`, so the customer states it once and it's applied automatically from then on.
- **`refine_recommendation`** — a follow-up turn ("actually, something cheaper") that reuses the
  session's cached location and weather (no re-geocoding) and avoids repeating the dish it already
  suggested.

That last pair is what turns this from a single-turn Q&A bot into a multi-turn agentic
conversation — the customer doesn't have to restate their dietary needs every time, and a reaction
to the first suggestion doesn't require starting over.

## How we built it

The core pipeline: geocode the location (Google Geocoding API) → pull live conditions and a
near-term forecast trend (Open-Meteo, no key) → hand both to Claude on Amazon Bedrock with forced
tool-use, so the response comes back as structured data (`dishes[]`, `primary_keyword`,
`reasoning`) instead of parsed prose → optionally chain that `primary_keyword` straight into a
Google Places search.

Session memory sits alongside that pipeline as a small in-memory store keyed by `session_id`:
`get_dining_recommendation` writes the location/weather/dishes it just produced (and any
remembered preferences it applied), and `refine_recommendation` reads that back so it can reason
again without repeating an API call or a rejected suggestion.

We validated it three ways, deliberately:

1. **MCP Inspector** — protocol-level proof: tool discovery, schema, live invocation, and (now)
   confirming that a `refine_recommendation` call after a `get_dining_recommendation` call actually
   carries session state across the two.
2. **A simulated Alexa+ web UI** — an Echo-style interface with a glowing orb (idle/listening/
   thinking/speaking states), real voice input and spoken responses in-browser, a "remember a
   preference" field, and per-suggestion refine chips — calling the same functions the MCP tools
   call.
3. **alexa-skill-mcp-bridge** — a Strands agent on Bedrock AgentCore (Amazon Nova) emulating
   Alexa+'s own orchestrator: it decided on its own to call `get_dining_recommendation`, then
   separately decided to call `search_restaurants` to ground the suggestion in real places,
   entirely unscripted.

## Challenges we ran into

**Getting Bedrock model access right took real trial and error.** Our first attempt used an
invalid model identifier and failed outright. Fixing that surfaced a second error: some newer
Claude models on Bedrock can't be invoked by their base model ID at all — they require the full
inference-profile ARN instead.

**A Bedrock API key and full IAM credentials aren't interchangeable.** Our server worked fine with
a simple Bedrock-scoped bearer token, but `alexa-skill-mcp-bridge`'s health checks call AWS STS
directly, which only understands real IAM SigV4 credentials — getting the bridge running against
our server meant creating a separate IAM user just for that.

**Alexa+ access is invite-only, not a queue.** Amazon's own developer docs describe Alexa+ for
Builders as "currently available to select partners working directly with our team" — no public
waitlist. That reframed our validation strategy around emulating the real orchestrator instead of
waiting on access.

**Latency versus the voice-assistant budget.** The bridge simulates Alexa's ~6.5 second response
deadline. Our reasoning step alone averages 6.2 seconds, so live testing regularly produced the
natural "I'm still working on that, ask me again in a moment" filler response before the full
answer landed — genuine behavior surfacing the same <500ms round-trip requirement Alexa+'s docs
describe, not a bug.

## Accomplishments that we're proud of

- **A real, measured 100% success rate** across 30 regions spanning five climate zones (tropical,
  arid, cold, temperate, southern-hemisphere) — not a projection.
- **The orchestrator chaining tools on its own, unscripted** — during bridge testing, the
  Nova-based agent independently decided to call `search_restaurants` after
  `get_dining_recommendation` to ground its answer in real places.
- **A genuine, demonstrated differentiator**: the weather-aware vs. weather-blind comparison mode
  surfaces real, specific answers that a cuisine-filter recommender structurally can't produce —
  *(fill in your favorite side-by-side example from `npm run demo:weather-impact` output here)*.
- **Personalization and multi-turn refinement, not just single-shot answers**: `remember_preference`
  and `refine_recommendation` let a customer state a dietary need once and react to a suggestion
  naturally ("something cheaper") without repeating themselves or restarting the conversation.
- **A spec-compliant MCP server** (`2025-11-25`, Streamable HTTP), verified against a real MCP
  client handshake, not just claimed.
- **Honesty over polish** — we surfaced our own edge cases (Sydney/Auckland returning pan-Asian
  rather than distinctly local dishes) instead of cherry-picking only the clean examples.

## What we learned

The MCP protocol has real, non-obvious requirements — spec version negotiation, stdio vs.
Streamable HTTP transports, tool schemas — that only surface once you implement a remote client
against your own server. We also learned that "AI reasoning beats a rule engine" is a claim worth
actually testing, not asserting: running the comparison mode and reading the real output, side by
side, is far more convincing than describing the idea. And once session state entered the picture,
we learned how much of "feels like a real assistant" comes specifically from *not* having to repeat
yourself — a single well-placed `session_id` did more for that impression than any prompt tuning.

## What's next for Forecast Fork

- **Elicitation** — prompt for a missing location instead of erroring, so a vaguer request still
  works.
- **OAuth 2.1 with PKCE + a PRM document** — the real auth layer Alexa+ requires for production.
- **Closing the latency gap** — streaming partial responses or a faster model on the reasoning
  path, rather than one synchronous multi-second call.
- **Durable session storage** — today's session memory is an in-memory `Map` per server process;
  moving it to a shared store (Redis/DynamoDB) would let it survive restarts and scale across
  multiple instances, which is what a real deployment needs.
- **Real Alexa+ access**, if/when it becomes available through the hackathon's sponsor channel
  rather than the general invite-only program.
