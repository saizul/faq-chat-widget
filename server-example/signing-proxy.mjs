// Public endpoint for the widget's "send this chat to our team" option.
//
//   browser widget  --POST JSON-->  this proxy  --POST JSON + X-Signature-->  n8n / your CRM
//
// The HMAC secret lives ONLY here (environment variable). The browser never sees it.
//
//   SIGNING_SECRET=change-me TARGET_URL=https://n8n.example.com/webhook/faq-handoff \
//   ALLOWED_ORIGIN=https://example.com node server-example/signing-proxy.mjs
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const { SIGNING_SECRET, TARGET_URL, ALLOWED_ORIGIN, PORT = "8787" } = process.env;
if (!SIGNING_SECRET || !TARGET_URL || !ALLOWED_ORIGIN) {
  console.error("Set SIGNING_SECRET, TARGET_URL and ALLOWED_ORIGIN");
  process.exit(1);
}

const MAX_BYTES = 64 * 1024;
const hits = new Map(); // naive per-IP rate limit: 5 requests / minute

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  if (req.method !== "POST" || req.url !== "/handoff") return void res.writeHead(404).end();
  if (req.headers.origin !== ALLOWED_ORIGIN) return void res.writeHead(403).end();
  if (limited(req.socket.remoteAddress ?? "?")) return void res.writeHead(429).end();

  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) return void res.writeHead(413).end();
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks);

  let data;
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch {
    return void res.writeHead(400).end();
  }
  if (data?.type !== "faq-chat-handoff" || !Array.isArray(data.messages)) return void res.writeHead(422).end();

  // Sign exactly the bytes we forward. The receiver recomputes HMAC-SHA256 over the raw body.
  const body = JSON.stringify(data);
  const signature = createHmac("sha256", SIGNING_SECRET).update(body).digest("hex");
  try {
    const upstream = await fetch(TARGET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": `sha256=${signature}` },
      body,
    });
    res.writeHead(upstream.ok ? 200 : 502).end();
  } catch {
    res.writeHead(502).end();
  }
}).listen(Number(PORT), () => console.log(`signing proxy on :${PORT}/handoff`));
