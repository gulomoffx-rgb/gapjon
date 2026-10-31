"use strict";
/* All app rules live here: who may do what, and what each action changes.
   The Mini App sends actions; the server checks permissions, applies them and returns fresh state. */
const crypto = require("node:crypto");
const { CITIES } = require("./places");

const LANGS = ["uz", "ru", "en"];
const CURRENCIES = ["UZS", "USD", "EUR", "RUB"];
const TYPES = ["choyxona", "restaurant", "home", "other"];
const MAX_MEMBERS = 30;
const TZ_OFFSET_MIN = 5 * 60; /* Asia/Tashkent, UTC+5, no daylight saving */

class AppError extends Error { constructor(msg, status) { super(msg); this.status = status || 400; } }
const fail = (msg, status) => { throw new AppError(msg, status); };

function id(prefix) { return prefix + crypto.randomBytes(6).toString("base64url"); }
function code() { return crypto.randomBytes(5).toString("base64url").replace(/[-_]/g, "x"); }
function now() { return Date.now(); }
function tashkentNow() { return new Date(Date.now() + TZ_OFFSET_MIN * 60000); } /* read with getUTC* */
function nextMonthStr() {
  const d = tashkentNow();
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  return m === 12 ? (y + 1) + "-01" : y + "-" + String(m + 1).padStart(2, "0");
}
function monthOf(start, i) { const [y, m] = start.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + i, 1)); return d; }
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function monthLongEn(start, i) { const d = monthOf(start, i); return EN_MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
function dayLabelEn(iso) {
  const p = String(iso || "").split("-").map(Number);
  if (p.length !== 3 || !p[0]) return "";
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()] + ", " + EN_MONTHS[d.getUTCMonth()].slice(0, 3) + " " + d.getUTCDate();
}
function cleanText(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max); }
function normPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998")) d = d.slice(3);
  return d;
}

function create(db, notifier) {
  const q = (sql) => db.prepare(sql);
  const notify = notifier || (() => {});

  /* ---------- reads ---------- */
  const getUser = (uid) => q("SELECT * FROM users WHERE id = ? AND deleted = 0").get(uid);
  const getGap = (gid) => q("SELECT * FROM gaps WHERE id = ? AND deleted = 0").get(gid);
  const membersOf = (gid) => q("SELECT * FROM members WHERE gap_id = ? ORDER BY pos").all(gid);
  const memberOf = (gid, uid) => q("SELECT * FROM members WHERE gap_id = ? AND user_id = ?").get(gid, uid);
  const isMgr = (m) => m && (m.role === "org" || m.role === "co");
  function orderOf(g) { return g.order_json ? JSON.parse(g.order_json) : null; }
  function displayName(m) { if (m.user_id) { const u = getUser(m.user_id); if (u) return u.name; } return m.name; }

  function needMember(gid, uid) {
    const g = getGap(gid); if (!g) fail("This gap no longer exists.", 404);
    const me = memberOf(gid, uid); if (!me) fail("You're not a member of this gap.", 403);
    return { g, me };
  }
  function needMgr(gid, uid) {
    const r = needMember(gid, uid);
    if (!isMgr(r.me)) fail("Only the organizer or a co-organizer can do this.", 403);
    return r;
  }
  function post(gid, memberId, text, place) {
    const mid = id("m");
    q("INSERT INTO messages (id, gap_id, member_id, text, place_json, t) VALUES (?,?,?,?,?,?)")
      .run(mid, gid, memberId || null, text || "", place ? JSON.stringify(place) : null, now());
    return mid;
  }
  function placeById(pid) { return pid ? q("SELECT * FROM places WHERE id = ?").get(pid) : null; }
  function userPrefs(u) { let n = {}; try { n = JSON.parse(u.notify || "{}"); } catch (e) {} return n; }
  /* Send a bot message to each member who is a user, has that kind of notification on, and is not the actor. */
  function tell(gid, kind, build, exceptUid) {
    membersOf(gid).forEach((m) => {
      if (!m.user_id || m.user_id === exceptUid) return;
      const u = getUser(m.user_id); if (!u || !u.registered) return;
      const p = userPrefs(u);
      if (p.pause || p[kind] === false) return;
      notify(u, build(u, m));
    });
  }

  /* ---------- state sent to the Mini App ---------- */
  function buildGap(g, uid, people) {
    const members = membersOf(g.id);
    const order = orderOf(g);
    const pay = {};
    q("SELECT member_id FROM payments WHERE gap_id = ? AND round = ?").all(g.id, g.round).forEach((p) => { pay[p.member_id] = true; });
    const mr = q("SELECT * FROM meets WHERE gap_id = ? AND round = ?").get(g.id, g.round);
    let meet = null;
    if (mr) {
      const rsvp = {};
      q("SELECT member_id, answer FROM rsvps WHERE gap_id = ? AND round = ?").all(g.id, g.round).forEach((r) => { rsvp[r.member_id] = r.answer; });
      meet = { round: mr.round, stage: mr.stage, options: [], type: mr.type || "", placeId: mr.place_id, place: mr.place || "", date: mr.date || "", time: mr.time || "", host: mr.host, budget: mr.budget || "", fromMsg: mr.from_msg, rsvp };
    }
    const chat = q("SELECT * FROM messages WHERE gap_id = ? ORDER BY t, rowid").all(g.id)
      .map((c) => ({ id: c.id, from: c.member_id, text: c.text, place: c.place_json ? JSON.parse(c.place_json) : undefined, t: c.t }));
    const read = q("SELECT seen FROM reads WHERE gap_id = ? AND user_id = ?").get(g.id, uid);
    return {
      id: g.id, name: g.name, amount: g.amount, cur: g.cur, day: g.day, start: g.start, round: g.round, done: !!g.done,
      order, pay, meet, chat, seen: read ? read.seen : 0, invite: g.invite,
      members: members.map((m) => {
        const u = m.user_id ? getUser(m.user_id) : null;
        if (u && m.user_id !== uid) people[String(u.id)] = person(u);
        return { id: m.id, name: u ? u.name : m.name, me: m.user_id === uid, role: m.role || null, uid: m.user_id ? String(m.user_id) : null, photo: u ? (u.photo || u.tg_photo || null) : null };
      })
    };
  }
  function person(u) { return { uid: String(u.id), name: u.name, phone: u.phone || "", photo: u.photo || u.tg_photo || null }; }
  function state(uid) {
    const u = getUser(uid);
    const people = {};
    const friends = q("SELECT friend_id FROM friends WHERE user_id = ?").all(uid).map((r) => r.friend_id);
    friends.forEach((fid) => { const f = getUser(fid); if (f) people[String(f.id)] = person(f); });
    const gaps = q("SELECT g.* FROM gaps g JOIN members m ON m.gap_id = g.id WHERE m.user_id = ? AND g.deleted = 0 ORDER BY g.created_at DESC").all(uid)
      .map((g) => buildGap(g, uid, people));
    return {
      user: { id: String(u.id), name: u.name, phone: u.phone || "", city: u.city, lang: u.lang, currency: u.currency, photo: u.photo || u.tg_photo || null, ownPhoto: !!u.photo, notify: userPrefs(u), registered: !!u.registered },
      friends: friends.filter((f) => people[String(f)]).map(String),
      people, gaps,
      places: q("SELECT id, city, name, type, area, price, offer, room, demo FROM places WHERE active = 1").all()
    };
  }

  /* ---------- users ---------- */
  function upsertTelegramUser(tg) {
    const name = cleanText([tg.first_name, tg.last_name].filter(Boolean).join(" ") || tg.username || "Gapjon user", 30);
    const ex = q("SELECT * FROM users WHERE id = ?").get(tg.id);
    if (!ex) {
      const lang = /^ru/.test(tg.language_code || "") ? "ru" : /^en/.test(tg.language_code || "") ? "en" : "uz";
      q("INSERT INTO users (id, name, username, tg_photo, lang, created_at) VALUES (?,?,?,?,?,?)").run(tg.id, name, tg.username || null, tg.photo_url || null, lang, now());
    } else {
      q("UPDATE users SET username = ?, tg_photo = COALESCE(?, tg_photo) WHERE id = ?").run(tg.username || null, tg.photo_url || null, tg.id);
      if (ex.deleted) q("UPDATE users SET deleted = 0, registered = 0, name = ? WHERE id = ?").run(name, tg.id);
    }
    return getUser(tg.id);
  }
  function savePhone(uid, raw) {
    const phone = normPhone(raw);
    if (phone.length < 7) return false;
    const other = q("SELECT id FROM users WHERE phone = ? AND id != ?").get(phone, uid);
    if (other) q("UPDATE users SET phone = NULL WHERE id = ?").run(other.id);
    q("UPDATE users SET phone = ? WHERE id = ?").run(phone, uid);
    return true;
  }

  /* ---------- actions ---------- */
  const lookups = new Map();
  const A = {
    register(uid, p) {
      const u = getUser(uid);
      if (!u.phone) fail("Share your phone number first.");
      if (!p.consent) fail("Please accept the privacy policy to continue.");
      const name = cleanText(p.name, 30) || u.name;
      const city = CITIES.includes(p.city) ? p.city : "Tashkent";
      const lang = LANGS.includes(p.lang) ? p.lang : u.lang;
      q("UPDATE users SET name = ?, city = ?, lang = ?, registered = 1, consent_at = ? WHERE id = ?").run(name, city, lang, now(), uid);
    },
    profile(uid, p) {
      const u = getUser(uid);
      if (p.name !== undefined) { const n = cleanText(p.name, 30); if (!n) fail("Enter your name so friends recognise you."); q("UPDATE users SET name = ? WHERE id = ?").run(n, uid); }
      if (p.city !== undefined) { if (!CITIES.includes(p.city)) fail("Unknown city."); q("UPDATE users SET city = ? WHERE id = ?").run(p.city, uid); }
      if (p.lang !== undefined) { if (!LANGS.includes(p.lang)) fail("Unknown language."); q("UPDATE users SET lang = ? WHERE id = ?").run(p.lang, uid); }
      if (p.currency !== undefined) { if (!CURRENCIES.includes(p.currency)) fail("Unknown currency."); q("UPDATE users SET currency = ? WHERE id = ?").run(p.currency, uid); }
      if (p.photo !== undefined) {
        if (p.photo === null) q("UPDATE users SET photo = NULL WHERE id = ?").run(uid);
        else { if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.photo) || p.photo.length > 200000) fail("Couldn't read that image. Try another one."); q("UPDATE users SET photo = ? WHERE id = ?").run(p.photo, uid); }
      }
      if (p.notify !== undefined) {
        const keys = ["pause", "due", "paid", "turn", "chat", "meet", "offers"], n = {};
        keys.forEach((k) => { if (typeof p.notify[k] === "boolean") n[k] = p.notify[k]; });
        q("UPDATE users SET notify = ? WHERE id = ?").run(JSON.stringify(Object.assign(userPrefs(u), n)), uid);
      }
    },
    "delete-account"(uid) {
      q("UPDATE members SET user_id = NULL WHERE user_id = ?").run(uid);
      q("DELETE FROM friends WHERE user_id = ? OR friend_id = ?").run(uid, uid);
      q("UPDATE users SET deleted = 1, registered = 0, phone = NULL, photo = NULL, tg_photo = NULL, username = NULL, name = 'Deleted user' WHERE id = ?").run(uid);
    },
    find(uid, p) {
      const t = Date.now(), list = (lookups.get(uid) || []).filter((x) => t - x < 3600000);
      if (list.length >= 30) fail("Too many searches. Try again in an hour.", 429);
      list.push(t); lookups.set(uid, list);
      const phone = normPhone(p.phone);
      if (phone.length !== 9) fail("Enter the 9 digits after +998, for example 90 123 45 67.");
      const f = q("SELECT * FROM users WHERE phone = ? AND deleted = 0 AND registered = 1 AND id != ?").get(phone, uid);
      return { found: f ? person(f) : null };
    },
    "add-friend"(uid, p) {
      const f = getUser(Number(p.userId)); if (!f) fail("That person isn't on Gapjon.");
      q("INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)").run(uid, f.id);
    },
    "rm-friend"(uid, p) { q("DELETE FROM friends WHERE user_id = ? AND friend_id = ?").run(uid, Number(p.userId)); },

    "create-gap"(uid, p) {
      const name = cleanText(p.name, 40); if (!name) fail("Give the gap a name so members recognise it.");
      const amount = Math.floor(Number(p.amount)); if (!(amount > 0) || amount > 1e12) fail("Enter the monthly amount each member pays.");
      const cur = CURRENCIES.includes(p.cur) ? p.cur : "UZS";
      const day = [1, 5, 10, 15, 20, 25].includes(Number(p.day)) ? Number(p.day) : 15;
      const myFriends = new Set(q("SELECT friend_id FROM friends WHERE user_id = ?").all(uid).map((r) => String(r.friend_id)));
      const picked = [...new Set((p.friendIds || []).map(String))].filter((f) => myFriends.has(f));
      const extra = (p.extraNames || []).map((n) => cleanText(n, 30)).filter(Boolean);
      if (picked.length + extra.length < 2) fail("Choose at least 2 members besides you.");
      if (picked.length + extra.length + 1 > MAX_MEMBERS) fail("A gap can have up to 30 members.");
      const gid = id("g"), me = getUser(uid);
      q("INSERT INTO gaps (id, name, amount, cur, day, invite, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)").run(gid, name, amount, cur, day, code(), uid, now());
      const ins = q("INSERT INTO members (id, gap_id, user_id, name, role, pos) VALUES (?,?,?,?,?,?)");
      let pos = 0;
      ins.run(id("p"), gid, uid, me.name, "org", pos++);
      let coName = null;
      picked.forEach((f) => { const fu = getUser(Number(f)); const co = p.co === "u:" + f; if (co) coName = fu.name; ins.run(id("p"), gid, fu.id, fu.name, co ? "co" : null, pos++); });
      extra.forEach((n, i) => { const co = p.co === "x:" + i; if (co) coName = n; ins.run(id("p"), gid, null, n, co ? "co" : null, pos++); });
      post(gid, null, me.name + " created the gap with " + pos + " members.");
      if (coName) post(gid, null, coName + " is co-organizer.");
      q("INSERT OR REPLACE INTO reads (gap_id, user_id, seen) VALUES (?,?,?)").run(gid, uid, q("SELECT COUNT(*) n FROM messages WHERE gap_id = ?").get(gid).n);
      tell(gid, "chat", (u) => ({ key: "added", gap: name, by: me.name, gapId: gid }), uid);
      return { gapId: gid };
    },
    "join-info"(uid, p) {
      const g = q("SELECT * FROM gaps WHERE invite = ? AND deleted = 0").get(String(p.code || ""));
      if (!g) fail("This invite link isn't valid any more.", 404);
      const ms = membersOf(g.id), mine = ms.find((m) => m.user_id === uid);
      const org = ms.find((m) => m.role === "org");
      return {
        gap: { id: g.id, name: g.name, amount: g.amount, cur: g.cur, day: g.day, members: ms.length, drawn: !!g.order_json, organizer: org ? displayName(org) : "" },
        already: !!mine,
        open: ms.filter((m) => !m.user_id).map((m) => ({ id: m.id, name: m.name })),
        canJoinNew: !g.order_json && !g.done && ms.length < MAX_MEMBERS
      };
    },
    join(uid, p) {
      const g = q("SELECT * FROM gaps WHERE invite = ? AND deleted = 0").get(String(p.code || ""));
      if (!g) fail("This invite link isn't valid any more.", 404);
      if (memberOf(g.id, uid)) return { gapId: g.id };
      const me = getUser(uid);
      if (p.memberId) {
        const m = q("SELECT * FROM members WHERE id = ? AND gap_id = ? AND user_id IS NULL").get(String(p.memberId), g.id);
        if (!m) fail("That place in the gap is already taken.");
        q("UPDATE members SET user_id = ?, name = ? WHERE id = ?").run(uid, me.name, m.id);
      } else {
        if (g.order_json || g.done) fail("The order is already drawn, so new members can't join. Ask the organizer to add your name.");
        const n = q("SELECT COUNT(*) n FROM members WHERE gap_id = ?").get(g.id).n;
        if (n >= MAX_MEMBERS) fail("A gap can have up to 30 members.");
        q("INSERT INTO members (id, gap_id, user_id, name, role, pos) VALUES (?,?,?,?,?,?)").run(id("p"), g.id, uid, me.name, null, n);
      }
      post(g.id, null, me.name + " joined the gap.");
      tell(g.id, "chat", () => ({ key: "joined", gap: g.name, who: me.name, gapId: g.id }), uid);
      return { gapId: g.id };
    },
    draw(uid, p) {
      const { g } = needMgr(p.gapId, uid);
      if (g.order_json) fail("The order is already drawn.");
      const ms = membersOf(g.id);
      const ids = ms.map((m) => m.id);
      for (let i = ids.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      const start = nextMonthStr();
      q("UPDATE gaps SET order_json = ?, start = ?, round = 0 WHERE id = ?").run(JSON.stringify(ids), start, g.id);
      const first = ms.find((m) => m.id === ids[0]);
      post(g.id, null, "Order drawn. " + displayName(first) + " receives first, in " + monthLongEn(start, 0) + ".");
      tell(g.id, "turn", (u, m) => ({ key: "drawn", gap: g.name, pos: ids.indexOf(m.id), start, gapId: g.id }), null);
    },
    pay(uid, p) {
      const { g, me } = needMember(p.gapId, uid);
      if (!g.order_json || g.done) fail("This gap isn't running.");
      q("INSERT OR IGNORE INTO payments (gap_id, round, member_id, paid_at, receipt) VALUES (?,?,?,?,?)").run(g.id, g.round, me.id, now(), p.receipt ? 1 : 0);
      post(g.id, null, displayName(me) + " paid" + (p.receipt ? " and attached a receipt" : ""));
      const rec = membersOf(g.id).find((m) => m.id === JSON.parse(g.order_json)[g.round]);
      tell(g.id, "paid", () => ({ key: "paid", gap: g.name, who: displayName(me), gapId: g.id }), uid);
      return { recipient: displayName(rec) };
    },
    markpaid(uid, p) {
      const { g } = needMgr(p.gapId, uid);
      const m = q("SELECT * FROM members WHERE id = ? AND gap_id = ?").get(String(p.memberId), g.id); if (!m) fail("Unknown member.");
      q("INSERT OR IGNORE INTO payments (gap_id, round, member_id, paid_at) VALUES (?,?,?,?)").run(g.id, g.round, m.id, now());
      post(g.id, null, displayName(m) + " paid");
      if (m.user_id && m.user_id !== uid) { const u = getUser(m.user_id); if (u && u.registered && !userPrefs(u).pause && userPrefs(u).paid !== false) notify(u, { key: "confirmed", gap: g.name, gapId: g.id }); }
    },
    unpay(uid, p) {
      const { g } = needMgr(p.gapId, uid);
      q("DELETE FROM payments WHERE gap_id = ? AND round = ? AND member_id = ?").run(g.id, g.round, String(p.memberId));
    },
    complete(uid, p) {
      const { g } = needMgr(p.gapId, uid);
      if (!g.order_json || g.done) fail("This gap isn't running.");
      const ms = membersOf(g.id);
      const paid = q("SELECT COUNT(*) n FROM payments WHERE gap_id = ? AND round = ?").get(g.id, g.round).n;
      if (paid < ms.length) fail("Not everyone has paid yet.");
      const order = JSON.parse(g.order_json), next = g.round + 1;
      if (next >= ms.length) {
        q("UPDATE gaps SET done = 1 WHERE id = ?").run(g.id);
        post(g.id, null, "Gap finished. Everyone has had a turn.");
        tell(g.id, "turn", () => ({ key: "finished", gap: g.name, gapId: g.id }), null);
        return { done: true };
      }
      q("UPDATE gaps SET round = ? WHERE id = ?").run(next, g.id);
      const rec = ms.find((m) => m.id === order[next]);
      post(g.id, null, "Round " + (next + 1) + " started. This month's payout goes to " + displayName(rec) + ".");
      tell(g.id, "turn", (u, m) => ({ key: m.id === rec.id ? "yourturn" : "round", gap: g.name, who: displayName(rec), round: next + 1, gapId: g.id }), null);
      return { done: false, next: displayName(rec) };
    },
    suggest(uid, p) {
      const { g, me } = needMember(p.gapId, uid);
      const pl = p.place || {};
      let place;
      if (pl.placeId) { const P = placeById(String(pl.placeId)); if (!P) fail("Unknown place."); place = { placeId: P.id, type: P.type, name: "" }; }
      else { if (!TYPES.includes(pl.type)) fail("Unknown place type."); place = { placeId: null, type: pl.type, name: cleanText(pl.name, 60) || "Someone's home" }; }
      post(g.id, me.id, "", place);
      tell(g.id, "chat", () => ({ key: "suggested", gap: g.name, who: displayName(me), place: place.placeId ? placeById(place.placeId).name : place.name, gapId: g.id }), uid);
    },
    "set-meet"(uid, p) {
      const { g } = needMgr(p.gapId, uid);
      if (!g.order_json || g.done) fail("This gap isn't running.");
      const type = TYPES.includes(p.type) ? p.type : "choyxona";
      const P = p.placeId ? placeById(String(p.placeId)) : null;
      const place = P ? "" : type === "home" ? "" : cleanText(p.place, 60);
      if (!P && type !== "home" && !place) fail("Add the name of the place.");
      const host = p.host && q("SELECT id FROM members WHERE id = ? AND gap_id = ?").get(String(p.host), g.id) ? String(p.host) : null;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date || "") ? p.date : "";
      const time = /^\d{2}:\d{2}$/.test(p.time || "") ? p.time : "";
      const prev = q("SELECT stage FROM meets WHERE gap_id = ? AND round = ?").get(g.id, g.round);
      if (!prev || prev.stage !== "final") q("DELETE FROM rsvps WHERE gap_id = ? AND round = ?").run(g.id, g.round);
      q("INSERT OR REPLACE INTO meets (gap_id, round, stage, type, place_id, place, date, time, host, budget, from_msg) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(g.id, g.round, "final", P ? P.type : type, P ? P.id : null, place, date, time, host, cleanText(p.budget, 20), p.fromMsg ? String(p.fromMsg) : null);
      if (host) q("INSERT OR IGNORE INTO rsvps (gap_id, round, member_id, answer) VALUES (?,?,?, 'yes')").run(g.id, g.round, host);
      let name = P ? P.name : place;
      if (!P && type === "home") { const h = host ? q("SELECT * FROM members WHERE id = ?").get(host) : null; name = h ? displayName(h) + "'s home" : "Someone's home"; }
      post(g.id, null, "Gathering set: " + name + (date ? ", " + dayLabelEn(date) : "") + ". Are you going?");
      tell(g.id, "meet", () => ({ key: "meet", gap: g.name, place: name, date, time, gapId: g.id }), uid);
    },
    "skip-meet"(uid, p) {
      const { g } = needMgr(p.gapId, uid);
      q("INSERT OR REPLACE INTO meets (gap_id, round, stage) VALUES (?,?, 'skip')").run(g.id, g.round);
      q("DELETE FROM rsvps WHERE gap_id = ? AND round = ?").run(g.id, g.round);
      post(g.id, null, "No gathering this month.");
    },
    rsvp(uid, p) {
      const { g, me } = needMember(p.gapId, uid);
      const target = String(p.memberId || me.id);
      if (target !== me.id && !isMgr(me)) fail("You can only answer for yourself.", 403);
      if (!q("SELECT 1 FROM meets WHERE gap_id = ? AND round = ? AND stage = 'final'").get(g.id, g.round)) fail("No gathering is set yet.");
      const cur = q("SELECT answer FROM rsvps WHERE gap_id = ? AND round = ? AND member_id = ?").get(g.id, g.round, target);
      if (cur && cur.answer === p.v) q("DELETE FROM rsvps WHERE gap_id = ? AND round = ? AND member_id = ?").run(g.id, g.round, target);
      else if (p.v === "yes" || p.v === "no") q("INSERT OR REPLACE INTO rsvps (gap_id, round, member_id, answer) VALUES (?,?,?,?)").run(g.id, g.round, target, p.v);
    },
    chat(uid, p) {
      const { g, me } = needMember(p.gapId, uid);
      const text = cleanText(p.text, 500); if (!text) return;
      post(g.id, me.id, text);
      const n = q("SELECT COUNT(*) n FROM messages WHERE gap_id = ?").get(g.id).n;
      q("INSERT OR REPLACE INTO reads (gap_id, user_id, seen) VALUES (?,?,?)").run(g.id, uid, n);
      tell(g.id, "chat", () => ({ key: "chat", gap: g.name, who: displayName(me), text, gapId: g.id }), uid);
    },
    seen(uid, p) {
      needMember(p.gapId, uid);
      const n = q("SELECT COUNT(*) n FROM messages WHERE gap_id = ?").get(p.gapId).n;
      q("INSERT OR REPLACE INTO reads (gap_id, user_id, seen) VALUES (?,?,?)").run(p.gapId, uid, n);
    },
    "set-role"(uid, p) {
      const { g, me } = needMember(p.gapId, uid);
      if (me.role !== "org") fail("Only the organizer can change roles.", 403);
      const m = q("SELECT * FROM members WHERE id = ? AND gap_id = ?").get(String(p.memberId), g.id);
      if (!m || m.id === me.id) fail("Unknown member.");
      const role = p.role === "co" ? "co" : null;
      q("UPDATE members SET role = ? WHERE id = ?").run(role, m.id);
      post(g.id, null, role ? displayName(m) + " is now a co-organizer." : displayName(m) + " is no longer a co-organizer.");
    },
    "delete-gap"(uid, p) {
      const { g, me } = needMember(p.gapId, uid);
      if (me.role !== "org") fail("Only the organizer can delete the gap.", 403);
      q("UPDATE gaps SET deleted = 1 WHERE id = ?").run(g.id);
    }
  };

  function act(uid, type, params) {
    const fn = A[type];
    if (!fn) fail("Unknown action.", 404);
    const u = getUser(uid);
    if (!u) fail("Please open Gapjon from Telegram again.", 401);
    const open = ["register", "profile", "delete-account"];
    if (!u.registered && !open.includes(type)) fail("Finish signing up first.", 403);
    db.exec("BEGIN");
    try { const r = fn(uid, params || {}); db.exec("COMMIT"); return r || {}; }
    catch (e) { db.exec("ROLLBACK"); throw e; }
  }

  /* ---------- payment reminders (run every few minutes; sends once per member per round) ---------- */
  function sendReminders() {
    const t = tashkentNow();
    if (t.getUTCHours() < 10 || t.getUTCHours() > 20) return;
    const tomorrow = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1));
    q("SELECT * FROM gaps WHERE deleted = 0 AND done = 0 AND order_json IS NOT NULL").all().forEach((g) => {
      const m0 = monthOf(g.start, g.round);
      if (m0.getUTCFullYear() !== tomorrow.getUTCFullYear() || m0.getUTCMonth() !== tomorrow.getUTCMonth() || g.day !== tomorrow.getUTCDate()) return;
      const paid = new Set(q("SELECT member_id FROM payments WHERE gap_id = ? AND round = ?").all(g.id, g.round).map((r) => r.member_id));
      membersOf(g.id).forEach((m) => {
        if (!m.user_id || paid.has(m.id)) return;
        const key = "due:" + g.id + ":" + g.round + ":" + m.id;
        if (q("SELECT 1 FROM reminders WHERE key = ?").get(key)) return;
        const u = getUser(m.user_id); if (!u || !u.registered) return;
        const pr = userPrefs(u);
        q("INSERT INTO reminders (key, sent_at) VALUES (?,?)").run(key, now());
        if (pr.pause || pr.due === false) return;
        notify(u, { key: "due", gap: g.name, amount: g.amount, cur: g.cur, day: g.day, gapId: g.id });
      });
    });
  }

  return { act, state, upsertTelegramUser, savePhone, getUser, sendReminders, AppError };
}

module.exports = { create, AppError, normPhone };
