"use strict";
/* Gapjon server: serves the Mini App, checks that every request really comes from Telegram,
   and runs the app's API and the bot. Needs Node.js 22.13 or newer. No npm packages. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { open } = require("./db");
const { create } = require("./logic");
const { createBot } = require("./bot");

/* ---------- settings (from environment variables, see .env.example) ---------- */
loadEnvFile(path.join(__dirname, "..", ".env"));
const cfg = {
  port: Number(process.env.PORT || 8080),
  token: process.env.BOT_TOKEN || "",
  webAppUrl: (process.env.WEBAPP_URL || "").replace(/\/$/, "") + "/",
  appShortName: process.env.APP_SHORT_NAME || "",
  dbFile: process.env.DB_FILE || path.join(__dirname, "..", "data", "gapjon.db"),
  adminIds: (process.env.ADMIN_IDS || "").split(",").map((s) => Number(s.trim())).filter(Boolean),
  dev: process.env.DEV === "1"
};
if (!cfg.token && !cfg.dev) { console.error("BOT_TOKEN is missing. Copy .env.example to .env and fill it in."); process.exit(1); }

fs.mkdirSync(path.dirname(cfg.dbFile), { recursive: true });
const db = open(cfg.dbFile);
let bot = null;
const app = create(db, (user, data) => bot && bot.notify(user, data));
let botUsername = process.env.BOT_USERNAME || "";

/* ---------- Telegram login check ----------
   https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
function verifyInitData(initData) {
  if (!initData || !cfg.token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => k + "=" + v).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(cfg.token).digest();
  const calc = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const age = Date.now() / 1000 - Number(params.get("auth_date") || 0);
  if (age > 7 * 86400) return null;
  try { return JSON.parse(params.get("user")); } catch (e) { return null; }
}
function authUser(req) {
  let tg = verifyInitData(req.headers["x-init-data"]);
  if (!tg && cfg.dev && req.headers["x-dev-user"]) {
    const [id, ...name] = String(req.headers["x-dev-user"]).split(":");
    tg = { id: Number(id), first_name: name.join(":") || "Dev user " + id, language_code: "en" };
  }
  if (!tg || !tg.id) return null;
  return app.upsertTelegramUser(tg);
}

/* ---------- HTTP ---------- */
const WEB = path.join(__dirname, "..", "webapp");
function page(file) {
  const html = fs.readFileSync(path.join(WEB, file), "utf8");
  const conf = { bot: botUsername, app: cfg.appShortName, dev: cfg.dev };
  return html.replace("/*__GAPJON_CONFIG__*/", "window.GAPJON = " + JSON.stringify(conf) + ";");
}
function sendJson(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error("Too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (e) { reject(Object.assign(new Error("Bad request"), { status: 400 })); } });
  });
}
const securityHeaders = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };

const server = http.createServer(async (req, res) => {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      return res.end(page("index.html"));
    }
    if (req.method === "GET" && url.pathname === "/privacy") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(WEB, "privacy.html")));
    }
    if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { ok: true });
    if (url.pathname.startsWith("/api/")) {
      const user = authUser(req);
      if (!user) return sendJson(res, 401, { ok: false, error: "Please open Gapjon from Telegram again." });
      if (req.method === "GET" && url.pathname === "/api/state") return sendJson(res, 200, { ok: true, state: app.state(user.id) });
      if (cfg.dev && req.method === "POST" && url.pathname === "/api/dev-phone") {
        /* DEV mode only: outside Telegram there is no bot to receive a shared contact */
        const body = await readBody(req, 1000);
        app.savePhone(user.id, body.phone);
        return sendJson(res, 200, { ok: true, state: app.state(user.id) });
      }
      if (req.method === "POST" && url.pathname === "/api/act") {
        const body = await readBody(req, 300000);
        const result = app.act(user.id, String(body.type || ""), body.params || {});
        return sendJson(res, 200, { ok: true, result, state: app.state(user.id) });
      }
    }
    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    sendJson(res, status, { ok: false, error: status >= 500 ? "Something went wrong. Please try again." : e.message });
  }
});

/* ---------- admin stats for the bot's /stats command ---------- */
function stats() {
  const n = (sql) => db.prepare(sql).get().n;
  return [
    "<b>Gapjon stats</b>",
    "Registered users: " + n("SELECT COUNT(*) n FROM users WHERE registered = 1 AND deleted = 0"),
    "Gaps: " + n("SELECT COUNT(*) n FROM gaps WHERE deleted = 0") + " (running: " + n("SELECT COUNT(*) n FROM gaps WHERE deleted = 0 AND done = 0 AND order_json IS NOT NULL") + ")",
    "Payments recorded: " + n("SELECT COUNT(*) n FROM payments"),
    "Chat messages: " + n("SELECT COUNT(*) n FROM messages WHERE member_id IS NOT NULL"),
    "New users, last 7 days: " + n("SELECT COUNT(*) n FROM users WHERE created_at > " + (Date.now() - 7 * 86400000))
  ].join("\n");
}

server.listen(cfg.port, async () => {
  console.log("Gapjon is listening on port " + cfg.port + (cfg.dev ? " (DEV mode: test logins allowed — never use in production)" : ""));
  if (cfg.token) {
    bot = createBot({ token: cfg.token, webAppUrl: cfg.webAppUrl, adminIds: cfg.adminIds }, { upsertTelegramUser: app.upsertTelegramUser, savePhone: app.savePhone, stats });
    try { const me = await bot.start(); if (!botUsername) botUsername = me.username; }
    catch (e) { console.error("Could not start the bot:", e.message); }
  }
  setInterval(() => { try { app.sendReminders(); } catch (e) { console.error("reminders:", e.message); } }, 10 * 60000);
});

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
}
