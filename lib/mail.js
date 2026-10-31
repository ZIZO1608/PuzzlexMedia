/* Sending the contact form's emails (designs in lib/emails.js). On when SMTP_HOST and CONTACT_TO are set.
     notify(m)        a new request: the team's alert + the sender's confirmation (AUTOREPLY=0 turns that off).
                      The confirmation goes to whatever address was typed in, so it can't become a spam cannon:
                      one per address per day, and at most AUTOREPLY_PER_HOUR (default 30) for the whole site
     reminders        every 30 minutes: requests still unopened in the admin panel after REMINDER_HOURS
                      (default 24, 0 = off) get one reminder to the team; none on Fridays, the day off
     sendTest()       every email, with a made-up request, to CONTACT_TO (the admin panel's test button) */
'use strict';

const crypto = require('node:crypto');
const { autoReply, teamAlert, reminder, isFriday } = require('./emails');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function createMail({ store, siteUrl, env = process.env }) {
  if (!env.SMTP_HOST || !env.CONTACT_TO) {
    const off = async () => { throw new Error('mail is off'); };
    return { enabled: false, to: null, autoreply: false, hours: 0, notify: async () => ({ emailed: false, confirmed: false }), sendTest: off, checkReminders: async () => 0, startReminders() {} };
  }
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === '1',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  const to = env.CONTACT_TO;
  const address = env.SMTP_FROM || env.SMTP_USER || to.split(',')[0].trim();
  const from = address.includes('<') ? address : `"PuzzleX Media" <${address}>`;
  const autoreply = env.AUTOREPLY !== '0';
  const hours = env.REMINDER_HOURS === undefined || env.REMINDER_HOURS === '' ? 24 : Number(env.REMINDER_HOURS) || 0;
  const perHour = Number(env.AUTOREPLY_PER_HOUR) || 30;
  const replied = new Map(); // address → time of its last confirmation
  const sentAt = [];         // times of the confirmations in the last hour
  setInterval(() => { const now = Date.now(); for (const [k, t] of replied) if (now - t >= DAY) replied.delete(k); }, HOUR).unref();
  // may this request get a confirmation? (counts it if so)
  function mayReply(m) {
    const now = Date.now(), key = m.email.trim().toLowerCase();
    while (sentAt.length && now - sentAt[0] >= HOUR) sentAt.shift();
    if (now - (replied.get(key) || 0) < DAY) return false;
    if (sentAt.length >= perHour) { console.warn('[contact] auto-reply limit for this hour reached: not confirming', m.id); return false; }
    replied.set(key, now);
    sentAt.push(now);
    return true;
  }
  const settings = () => store.read('settings.json', {});
  const ctx = () => ({ settings: settings(), siteUrl });

  const toTeam = (email, extra = {}) => transport.sendMail({ from, to, ...email, ...extra });
  // the sender's copy: replies reach the team; Auto-Submitted (RFC 3834) keeps other auto-responders from answering it
  const toSender = (m, email) => transport.sendMail({
    from, to: m.email, replyTo: settings().email || to, ...email, headers: { 'Auto-Submitted': 'auto-replied' },
  });

  async function notify(m) {
    let emailed = false, confirmed = false;
    await Promise.all([
      toTeam(teamAlert(m, ctx()), { replyTo: `"${m.name.replace(/"/g, '')}" <${m.email}>` })
        .then(() => { emailed = true; }, (err) => console.error('[contact] saved, but email failed:', err.message)),
      autoreply && mayReply(m) && toSender(m, autoReply(m, ctx()))
        .then(() => { confirmed = true; }, (err) => console.error('[contact] auto-reply failed:', err.message)),
    ]);
    return { emailed, confirmed };
  }

  // one email listing every request that just went past the limit; each is reminded about once
  async function checkReminders(now = Date.now()) {
    if (!hours || isFriday(new Date(now))) return 0;
    const due = (await store.readMessages()).filter((m) => {
      const age = now - Date.parse(m.date);
      return !m.read && !m.reminded && age >= hours * HOUR && age < 7 * 24 * HOUR; // older ones were seen to some other way
    });
    if (!due.length) return 0;
    await toTeam(reminder(due, { ...ctx(), hours, now }));
    const ids = new Set(due.map((m) => m.id));
    await store.rewriteMessages((list) => { for (const m of list) if (ids.has(m.id)) m.reminded = true; return list; });
    console.log(`[mail] reminder sent for ${due.length} unopened request(s)`);
    return due.length;
  }

  function startReminders() {
    if (!hours) return;
    const run = () => checkReminders().catch((err) => console.error('[mail] reminder failed:', err.message));
    setTimeout(run, 2 * 60 * 1000).unref();
    setInterval(run, 30 * 60 * 1000).unref();
  }

  async function sendTest() {
    const now = new Date().toISOString();
    const sample = (lang) => ({
      id: crypto.randomUUID(), date: now, lang, channel: 'email', read: false,
      name: lang === 'en' ? 'Sarah Ahmed' : 'سارة أحمد', company: lang === 'en' ? 'Al Noor Co.' : 'شركة النور',
      email: to.split(',')[0].trim(), phone: settings().whatsapp || '+963 900 000 000',
      services: ['identity', 'social-design', 'dev-store'],
      message: lang === 'en' ? 'This is a test request from the admin panel.' : 'هذا طلب تجريبي من لوحة التحكم.',
    });
    const tag = (email) => ({ ...email, subject: `[تجربة] ${email.subject}` });
    const ar = sample('ar'), en = sample('en');
    await toTeam(tag(autoReply(ar, ctx())));
    await toTeam(tag(autoReply(en, ctx())));
    await toTeam(tag(teamAlert(ar, ctx())));
    await toTeam(tag(reminder([{ ...ar, date: new Date(Date.now() - 26 * HOUR).toISOString() }], { ...ctx(), hours: hours || 24 })));
    return 4;
  }

  return { enabled: true, to, autoreply, hours, notify, sendTest, checkReminders, startReminders };
}

module.exports = { createMail };
