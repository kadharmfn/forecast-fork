import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { getDiningRecommendation } from "./tools/getDiningRecommendation.js";
import { refineRecommendation } from "./tools/refineRecommendation.js";
import { rememberPreference } from "./tools/rememberPreference.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// Demo UI — a local-only visual front end for the same tool logic the MCP server exposes.
// Not a hosted page; open http://localhost:<port>/demo in a browser on this machine.
app.use("/demo", express.static(path.join(__dirname, "..", "demo")));

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
