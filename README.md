# Gapjon for Telegram

Gapjon runs inside Telegram as a **Mini App** (the app screens) plus a **bot** (opens the app, receives phone numbers, sends reminders and notifications). Everything is in this folder: one small Node.js server, no extra packages, and one database file.

```
server/server.js   web server + Telegram login check + starts the bot
server/logic.js    all the rules: gaps, draw, payments, gatherings, chat, permissions
server/bot.js      the bot: /start, phone numbers, notifications, admin /stats
server/db.js       database tables (SQLite file in data/gapjon.db)
server/places.js   demo sponsored places per city (replace with real partners)
webapp/index.html  the app screens (same design as the draft)
webapp/privacy.html  privacy policy shown in the app (fill in the [ ] parts)
```

## 1. Create the bot (5 minutes, on your phone)

1. In Telegram, open **@BotFather** and send `/newbot`.
2. Name: `Gapjon`. Username: something ending in `bot`, for example `gapjon_bot` or `gapjonapp_bot`.
3. BotFather replies with a **token** like `7412345678:AAH...`. This token *is* the bot — whoever has it controls it. Keep it private. If it ever leaks, send `/revoke` to BotFather to get a new one.
4. Find your own Telegram ID: open **@userinfobot** and press Start. Copy the number. This makes you the admin.

## 2. Put it on your server in Uzbekistan

Telegram only opens Mini Apps over **HTTPS**, so you need a domain (for example `app.gapjon.uz`) pointing to the server.

Easiest way, with Docker:

```bash
cp .env.example .env        # then fill in BOT_TOKEN, WEBAPP_URL, ADMIN_IDS
nano Caddyfile              # put your domain instead of app.gapjon.uz
docker compose up -d --build
```

Caddy gets the HTTPS certificate automatically. Check `https://your-domain/health` shows `{"ok":true}`.

Without Docker: install Node.js 22.13 or newer, fill in `.env`, run `npm start`, and put it behind nginx or Caddy for HTTPS.

## 3. Register the Mini App

1. In @BotFather send `/newapp`, pick your bot.
2. Title `Gapjon`, a short description, a 640×360 picture (the logo on the cream background works).
3. Web App URL: your HTTPS address, e.g. `https://app.gapjon.uz`.
4. Short name: `app` (must match `APP_SHORT_NAME` in `.env`). Invite links then look like `t.me/gapjon_bot/app?startapp=join_xxxx`.
5. Optional: `/mybots` → your bot → Bot Settings → Configure Mini App → turn on, so the bot profile shows an "Open" button.

Restart the server (`docker compose restart gapjon`). Open your bot, press Start, then the **Gapjon** button.

## How you control it

| What | Where |
|---|---|
| Bot name, photo, description, about text | @BotFather → `/mybots` |
| Statistics (users, gaps, payments, messages) | send `/stats` to your bot (only works for IDs in `ADMIN_IDS`) |
| All data | `data/gapjon.db` on your server (open with any SQLite viewer, e.g. "DB Browser for SQLite") |
| Errors and activity | `docker compose logs -f gapjon` |
| Sponsored places | `server/places.js` (demo names now — replace with real partners) |
| Turn it off | `docker compose down`, or `/revoke` the token in BotFather |

The bot is a separate Telegram account that belongs to you through BotFather — you don't log in to it like a normal account. You talk to it like any user; the admin commands just answer only you.

**Backups:** copy `data/gapjon.db` every day (for example a cron job: `sqlite3 data/gapjon.db ".backup backups/gapjon-$(date +%F).db"`). Keep backups in Uzbekistan too.

## Test it on your computer first

```bash
npm run dev
```

Open `http://localhost:8080/?dev_user=101:Yusuf` in one browser window and `http://localhost:8080/?dev_user=202:Dilnoza` in another. Dev mode fakes the Telegram login and phone sharing (each test user gets the number 90 + their ID, e.g. 90 000 02 02). **Never set DEV=1 on the real server** — it lets anyone log in as anyone.

## What's different from the draft

- Sign-up uses the Telegram account. The phone number comes from Telegram's "share contact" (Telegram confirms it, so no SMS costs).
- Everything is stored on the server and shared live between members: the draw happens on the server (fair, can't be redone), and only organizers/co-organizers can draw, mark payments received, set gatherings, or change roles.
- Friends are found only by typing their full phone number (people can't browse other users).
- Organizers get an invite link per gap. Someone opening it can claim their name on the list or join as a new member before the draw.
- The bot sends notifications (added to a gap, order drawn, payments, your turn, gathering set, chat) and a payment reminder the day before the due date, 10:00–20:00 Tashkent time. Each person can turn these off in Account → Notifications.
- Account → Delete my account removes their phone number and photo.

## Before launch (legal checklist for Uzbekistan)

- Keep the server and backups physically in Uzbekistan (personal data localisation law).
- Register the database with the State Personalization Center (pd.gov.uz) — your hosting company may help.
- Fill in the `[DATE]`, `[COMPANY NAME]` and `[ADDRESS]` in `webapp/privacy.html`, and have a lawyer check it.
- Gapjon never touches money, which keeps you out of payment licensing. Keep it that way until you talk to a lawyer.

## Known limits (fine for a first launch)

- "Attach receipt" on the payment screen only records that a receipt was attached; the photo itself isn't uploaded yet.
- Photos are stored inside the database, resized small (240px).
- One server process. Good for thousands of users; beyond that, move to PostgreSQL.
