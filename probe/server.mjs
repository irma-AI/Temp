// Probe app for the Dokploy live tests: /version, /health, /sse with keep-alive, and LISTEN/NOTIFY with reconnect.
import http from "node:http";
import pg from "pg";

const VERSION = process.env.PROBE_VERSION ?? "dev";
const BROKEN = process.env.PROBE_BROKEN === "1";
const DB = process.env.DATABASE_URL;
const clients = new Set();
const db = { listening: false, reconnects: 0, lastError: null };

const send = (event, data) => { for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

async function listen() {
  if (!DB) return;
  const client = new pg.Client({ connectionString: DB });
  let done = false; // "error" is followed by "end": reconnect once
  const retry = (err) => {
    if (done) return; done = true;
    db.listening = false; db.lastError = String(err?.message ?? err);
    client.removeAllListeners(); client.end().catch(() => {});
    setTimeout(listen, 2000);
  };
  client.on("error", retry);
  client.on("end", () => retry("connection ended"));
  try {
    await client.connect();
    await client.query("LISTEN changes");
    client.on("notification", (n) => send("change", n.payload));
    if (db.listening === false && db.lastError) { db.reconnects++; send("resync", { reconnects: db.reconnects }); }
    db.listening = true;
  } catch (err) { retry(err); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/version") return res.end(JSON.stringify({ version: VERSION }));
  if (url.pathname === "/health") { res.statusCode = BROKEN ? 500 : 200; return res.end(BROKEN ? "broken" : "ok"); }
  if (url.pathname === "/db") return res.end(JSON.stringify(db));
  if (url.pathname === "/notify" && req.method === "POST" && DB) {
    const c = new pg.Client({ connectionString: DB });
    await c.connect(); await c.query("SELECT pg_notify('changes', $1)", [new Date().toISOString()]); await c.end();
    return res.end("sent");
  }
  if (url.pathname === "/sse") {
    const ka = Number(url.searchParams.get("keepalive") ?? 25);
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" });
    res.write(`event: hello\ndata: ${JSON.stringify({ version: VERSION, keepalive: ka })}\n\n`);
    clients.add(res);
    const timer = ka > 0 ? setInterval(() => res.write(`: ka ${new Date().toISOString()}\n\n`), ka * 1000) : null;
    req.on("close", () => { clients.delete(res); clearInterval(timer); });
    return;
  }
  res.statusCode = 404; res.end("not found");
});

server.listen(3000, () => console.log(`probe ${VERSION} on :3000, broken=${BROKEN}`));
listen();
