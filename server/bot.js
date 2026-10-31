"use strict";
/* Telegram bot: opens the Mini App, receives shared phone numbers, sends notifications,
   and answers admin commands. Uses long polling, so no webhook setup is needed. */

function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
function money(n, c) { return c === "USD" ? "$" + fmt(n) : c === "EUR" ? "€" + fmt(n) : c === "RUB" ? fmt(n) + " ₽" : fmt(n) + " so'm"; }
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

/* Notification texts in the user's language. */
const T = {
  open: { uz: "Gapjonni ochish", ru: "Открыть Gapjon", en: "Open Gapjon" },
  welcome: {
    uz: "Assalomu alaykum! <b>Gapjon</b> — gaplaringizni bir joyda yuritish uchun: navbat, to'lovlar, chat va gap kuni.\n\nBoshlash uchun pastdagi tugmani bosing.",
    ru: "Здравствуйте! <b>Gapjon</b> помогает вести гапы в одном месте: очередь, платежи, чат и встречи.\n\nНажмите кнопку ниже, чтобы начать.",
    en: "Salom! <b>Gapjon</b> keeps your gaps in one place: the payout order, payments, chat and gatherings.\n\nTap the button below to start."
  },
  join: {
    uz: "Sizni gapga taklif qilishdi. Qo'shilish uchun pastdagi tugmani bosing.",
    ru: "Вас пригласили в гап. Нажмите кнопку ниже, чтобы вступить.",
    en: "You've been invited to a gap. Tap the button below to join."
  },
  phoneSaved: {
    uz: "Rahmat! Raqamingiz saqlandi. Endi ilovaga qayting.",
    ru: "Спасибо! Номер сохранён. Вернитесь в приложение.",
    en: "Thanks! Your number is saved. Go back to the app."
  },
  phoneOther: {
    uz: "Iltimos, o'zingizning raqamingizni yuboring.",
    ru: "Пожалуйста, отправьте свой собственный номер.",
    en: "Please share your own phone number."
  },
  added: { uz: (d) => `<b>${esc(d.by)}</b> sizni «${esc(d.gap)}» gapiga qo'shdi.`, ru: (d) => `<b>${esc(d.by)}</b> добавил(а) вас в гап «${esc(d.gap)}».`, en: (d) => `<b>${esc(d.by)}</b> added you to the gap “${esc(d.gap)}”.` },
  joined: { uz: (d) => `«${esc(d.gap)}»: <b>${esc(d.who)}</b> gapga qo'shildi.`, ru: (d) => `«${esc(d.gap)}»: <b>${esc(d.who)}</b> вступил(а) в гап.`, en: (d) => `${esc(d.gap)}: <b>${esc(d.who)}</b> joined the gap.` },
  drawn: { uz: (d) => `«${esc(d.gap)}»: navbat aniqlandi. Siz ${d.pos + 1}-navbatdasiz.`, ru: (d) => `«${esc(d.gap)}»: очередь определена. Ваш номер — ${d.pos + 1}.`, en: (d) => `${esc(d.gap)}: the order is drawn. You're number ${d.pos + 1}.` },
  paid: { uz: (d) => `«${esc(d.gap)}»: <b>${esc(d.who)}</b> to'ladi.`, ru: (d) => `«${esc(d.gap)}»: <b>${esc(d.who)}</b> оплатил(а).`, en: (d) => `${esc(d.gap)}: <b>${esc(d.who)}</b> paid.` },
  confirmed: { uz: (d) => `«${esc(d.gap)}»: to'lovingiz qayd etildi.`, ru: (d) => `«${esc(d.gap)}»: ваш платёж отмечен.`, en: (d) => `${esc(d.gap)}: your payment is recorded.` },
  yourturn: { uz: (d) => `«${esc(d.gap)}»: bu oy <b>sizning navbatingiz</b>! A'zolar to'lovlarini kuting.`, ru: (d) => `«${esc(d.gap)}»: в этом месяце <b>ваша очередь</b>! Ждите платежей от участников.`, en: (d) => `${esc(d.gap)}: it's <b>your turn</b> this month! Members will pay you.` },
  round: { uz: (d) => `«${esc(d.gap)}»: ${d.round}-davra boshlandi. Bu oy pulni <b>${esc(d.who)}</b> oladi.`, ru: (d) => `«${esc(d.gap)}»: начался круг ${d.round}. В этом месяце получает <b>${esc(d.who)}</b>.`, en: (d) => `${esc(d.gap)}: round ${d.round} started. <b>${esc(d.who)}</b> receives this month.` },
  finished: { uz: (d) => `«${esc(d.gap)}» tugadi. Hamma o'z navbatini oldi.`, ru: (d) => `Гап «${esc(d.gap)}» завершён. Все получили свою очередь.`, en: (d) => `${esc(d.gap)} is finished. Everyone has had a turn.` },
  suggested: { uz: (d) => `«${esc(d.gap)}»: <b>${esc(d.who)}</b> joy taklif qildi: ${esc(d.place)}.`, ru: (d) => `«${esc(d.gap)}»: <b>${esc(d.who)}</b> предлагает место: ${esc(d.place)}.`, en: (d) => `${esc(d.gap)}: <b>${esc(d.who)}</b> suggested ${esc(d.place)}.` },
  meet: { uz: (d) => `«${esc(d.gap)}»: gap kuni belgilandi — <b>${esc(d.place)}</b>${d.date ? ", " + d.date : ""}${d.time ? ", " + d.time : ""}. Borasizmi?`, ru: (d) => `«${esc(d.gap)}»: встреча назначена — <b>${esc(d.place)}</b>${d.date ? ", " + d.date : ""}${d.time ? ", " + d.time : ""}. Вы придёте?`, en: (d) => `${esc(d.gap)}: gathering set at <b>${esc(d.place)}</b>${d.date ? ", " + d.date : ""}${d.time ? ", " + d.time : ""}. Are you going?` },
  chat: { uz: (d) => `«${esc(d.gap)}» · <b>${esc(d.who)}</b>: ${esc(d.text)}`, ru: (d) => `«${esc(d.gap)}» · <b>${esc(d.who)}</b>: ${esc(d.text)}`, en: (d) => `${esc(d.gap)} · <b>${esc(d.who)}</b>: ${esc(d.text)}` },
  due: { uz: (d) => `Eslatma: «${esc(d.gap)}» bo'yicha <b>${money(d.amount, d.cur)}</b> to'lov muddati ertaga (${d.day}-sana).`, ru: (d) => `Напоминание: завтра (${d.day}-е число) срок платежа <b>${money(d.amount, d.cur)}</b> в гапе «${esc(d.gap)}».`, en: (d) => `Reminder: your <b>${money(d.amount, d.cur)}</b> payment for ${esc(d.gap)} is due tomorrow (the ${d.day}th).` }
};
const L = (u) => (["uz", "ru", "en"].includes(u && u.lang) ? u.lang : "uz");

function createBot(cfg, deps) {
  const { token, webAppUrl, adminIds } = cfg;
  const api = async (method, body) => {
    const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(method + ": " + (j.description || r.status));
    return j.result;
  };
  const openButton = (lang, query) => ({ inline_keyboard: [[{ text: T.open[lang], web_app: { url: webAppUrl + (query || "") } }]] });
  const send = (chatId, text, extra) => api("sendMessage", Object.assign({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }, extra || {}));

  /* Used by the app logic for every notification. Failures (user blocked the bot) are ignored. */
  function notify(user, d) {
    const lang = L(user), t = T[d.key];
    if (!t) return;
    const text = typeof t[lang] === "function" ? t[lang](d) : t[lang];
    send(user.id, text, { reply_markup: openButton(lang, "?gap=" + encodeURIComponent(d.gapId || "")) }).catch(() => {});
  }

  async function handle(upd) {
    const msg = upd.message;
    if (!msg || !msg.from || msg.chat.type !== "private") return;
    const tgUser = msg.from;
    const user = deps.upsertTelegramUser(tgUser);
    const lang = L(user);
    if (msg.contact) {
      if (msg.contact.user_id !== tgUser.id) return send(msg.chat.id, T.phoneOther[lang]);
      deps.savePhone(tgUser.id, msg.contact.phone_number);
      return send(msg.chat.id, T.phoneSaved[lang], { reply_markup: openButton(lang) });
    }
    const text = (msg.text || "").trim();
    if (text.startsWith("/start")) {
      const payload = text.split(/\s+/)[1] || "";
      if (payload.startsWith("join_")) return send(msg.chat.id, T.join[lang], { reply_markup: openButton(lang, "?join=" + encodeURIComponent(payload.slice(5))) });
      return send(msg.chat.id, T.welcome[lang], { reply_markup: openButton(lang) });
    }
    if (adminIds.includes(tgUser.id)) {
      if (text === "/stats") return send(msg.chat.id, deps.stats());
      if (text === "/admin") return send(msg.chat.id, "<b>Admin commands</b>\n/stats — users, gaps, payments and messages");
    }
  }

  let offset = 0, running = false;
  async function poll() {
    running = true;
    while (running) {
      try {
        const updates = await api("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] });
        for (const u of updates) { offset = u.update_id + 1; await handle(u).catch((e) => console.error("bot update failed:", e.message)); }
      } catch (e) {
        console.error("bot polling error:", e.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  async function start() {
    await api("deleteWebhook", {}).catch(() => {});
    await api("setChatMenuButton", { menu_button: { type: "web_app", text: "Gapjon", web_app: { url: webAppUrl } } }).catch((e) => console.error(e.message));
    await api("setMyCommands", { commands: [{ command: "start", description: "Open Gapjon" }] }).catch(() => {});
    const me = await api("getMe");
    console.log("Bot @" + me.username + " is running");
    poll();
    return me;
  }
  return { start, notify, stop: () => { running = false; } };
}

module.exports = { createBot };
