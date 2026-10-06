import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import rateLimit from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { getDiningRecommendation } from "./tools/getDiningRecommendation.js";
import { refineRecommendation } from "./tools/refineRecommendation.js";
import { rememberPreference } from "./tools/rememberPreference.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set("trust proxy", 1); // needed for accurate per-IP limits behind a tunnel/proxy/load balancer
app.use(express.json());

// Demo UI — a local-only visual front end for the same tool logic the MCP server exposes.
// Not a hosted page; open http://localhost:<port>/demo in a browser on this machine.
app.use("/demo", express.static(path.join(__dirname, "..", "demo")));

// Every route below this point can trigger a real, metered API call (Google Geocoding/Places,
// Amazon Bedrock). If this server is ever reachable from the public internet (e.g. for judging),
// these are the only things standing between a stray link and an unbounded bill — not a
// substitute for hard quota caps on the Google Cloud / AWS side, just a first line of defense.
const perIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_IP ?? 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP — please wait a few minutes and try again." },
});

// Belt-and-suspenders against distributed abuse (many different IPs), since a per-IP limit alone
// doesn't cap total spend. Deliberately simple — in-memory, per-process, resets on restart; this
// is a demo/judging safety net, not production quota management.
const GLOBAL_DAILY_LIMIT = Number(process.env.GLOBAL_DAILY_REQUEST_LIMIT ?? 200);
let globalCount = 0;
let globalResetAt = Date.now() + 24 * 60 * 60 * 1000;
function globalDailyCap(_req: express.Request, res: express.Response, next: express.NextFunction) {
  if (Date.now() > globalResetAt) {
    globalCount = 0;
    globalResetAt = Date.now() + 24 * 60 * 60 * 1000;
  }
  if (globalCount >= GLOBAL_DAILY_LIMIT) {
    res.status(503).json({ error: "Daily usage limit reached for this demo deployment — please try again tomorrow." });
    return;
  }
  globalCount++;
  next();
}

app.use(["/api/recommend", "/api/refine", "/api/remember", "/mcp"], perIpLimiter, globalDailyCap);

app.post("/api/recommend", async (req, res) => {
  try {
    const { location, context, session_id } = req.body as {
      location?: string;
      context?: string;
      session_id?: string;
    };
    if (!location) {
      res.status(400).json({ error: "location is required" });
      return;
    }
    const result = await getDiningRecommendation({
      location,
      context,
      includeRestaurants: true,
      sessionId: session_id,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/refine", async (req, res) => {
  try {
    const { session_id, feedback } = req.body as { session_id?: string; feedback?: string };
    if (!session_id || !feedback) {
      res.status(400).json({ error: "session_id and feedback are required" });
      return;
    }
    const result = await refineRecommendation({
      sessionId: session_id,
      feedback,
      includeRestaurants: true,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/remember", (req, res) => {
  const { session_id, preference } = req.body as { session_id?: string; preference?: string };
  if (!session_id || !preference) {
    res.status(400).json({ error: "session_id and preference are required" });
    return;
  }
  const result = rememberPreference({ sessionId: session_id, preference });
  res.json(result);
});

// Stateless mode: each request gets its own server + transport pair. Our tools don't need
// cross-request session state, and this is what alexa-skill-mcp-bridge's local/cloud tracks
// expect to talk to.
app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless mode doesn't support the SSE-stream (GET) or session-close (DELETE) verbs.
const methodNotAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed in stateless mode." },
    id: null,
  });
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`forecast-fork MCP server (Streamable HTTP) listening at http://localhost:${port}/mcp`);
});
