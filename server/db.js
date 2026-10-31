"use strict";
/* Database: Node's built-in SQLite (Node 22.13+). One file, no external packages. */
const { DatabaseSync } = require("node:sqlite");
const { DEMO_PLACES } = require("./places");

function open(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,              -- Telegram user id
      name TEXT NOT NULL,
      username TEXT,
      phone TEXT UNIQUE,                   -- 9 digits after +998, or full international number
      city TEXT DEFAULT 'Tashkent',
      lang TEXT DEFAULT 'uz',
      currency TEXT DEFAULT 'UZS',
      photo TEXT,                          -- uploaded photo (small JPEG data URL)
      tg_photo TEXT,                       -- photo URL from Telegram, if any
      notify TEXT DEFAULT '{}',
      registered INTEGER DEFAULT 0,
      consent_at INTEGER,
      deleted INTEGER DEFAULT 0,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS friends (
      user_id INTEGER NOT NULL, friend_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, friend_id)
    );
    CREATE TABLE IF NOT EXISTS gaps (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, amount INTEGER NOT NULL, cur TEXT NOT NULL, day INTEGER NOT NULL,
      start TEXT, round INTEGER DEFAULT 0, done INTEGER DEFAULT 0, order_json TEXT,
      invite TEXT UNIQUE, created_by INTEGER, created_at INTEGER, deleted INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY, gap_id TEXT NOT NULL, user_id INTEGER, name TEXT NOT NULL, role TEXT, pos INTEGER
    );
    CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
    CREATE INDEX IF NOT EXISTS members_gap ON members(gap_id);
    CREATE TABLE IF NOT EXISTS payments (
      gap_id TEXT NOT NULL, round INTEGER NOT NULL, member_id TEXT NOT NULL, paid_at INTEGER, receipt INTEGER DEFAULT 0,
      PRIMARY KEY (gap_id, round, member_id)
    );
    CREATE TABLE IF NOT EXISTS meets (
      gap_id TEXT NOT NULL, round INTEGER NOT NULL, stage TEXT, type TEXT, place_id TEXT, place TEXT,
      date TEXT, time TEXT, host TEXT, budget TEXT, from_msg TEXT,
      PRIMARY KEY (gap_id, round)
    );
    CREATE TABLE IF NOT EXISTS rsvps (
      gap_id TEXT NOT NULL, round INTEGER NOT NULL, member_id TEXT NOT NULL, answer TEXT,
      PRIMARY KEY (gap_id, round, member_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, gap_id TEXT NOT NULL, member_id TEXT, text TEXT, place_json TEXT, t INTEGER
    );
    CREATE INDEX IF NOT EXISTS messages_gap ON messages(gap_id, t);
    CREATE TABLE IF NOT EXISTS reads (
      gap_id TEXT NOT NULL, user_id INTEGER NOT NULL, seen INTEGER DEFAULT 0,
      PRIMARY KEY (gap_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY, city TEXT, name TEXT, type TEXT, area TEXT, price INTEGER, offer TEXT, room TEXT,
      active INTEGER DEFAULT 1, demo INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS reminders (key TEXT PRIMARY KEY, sent_at INTEGER);
  `);
  const count = db.prepare("SELECT COUNT(*) AS n FROM places").get().n;
  if (!count) {
    const ins = db.prepare("INSERT INTO places (id, city, name, type, area, price, offer, room, active, demo) VALUES (?,?,?,?,?,?,?,?,1,1)");
    DEMO_PLACES.forEach((p) => ins.run(p.id, p.city, p.name, p.type, p.area, p.price, p.offer, p.room));
  }
  return db;
}

module.exports = { open };
