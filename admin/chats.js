/* PuzzleX admin — Shater's conversations and the leads found in them (lib/assistant.js → /api/admin/chats, /leads).
   «محادثات شاطر»: every conversation a visitor had with the assistant, newest first, opened to read in full.
   «العملاء المحتملون»: the conversations the AI judged to be a business or a likely client, with what it learned
   (who, what they need, budget, timeline, how to reach them), a follow-up status and a private note.
   Uses h, api, toast, ask, fmtDate, setPending, refreshMe and VIEWS from admin.js. */

const CH_TEMP = { hot: ['جاهز للبدء', 'hot'], warm: ['مهتم', 'warm'], cold: ['يستكشف', 'cold'] };
const CH_STATUS = { new: 'جديد', contacted: 'تم التواصل', won: 'صار عميلاً', lost: 'لم يكمل' };
const CH_PAGES = {
  '': 'الرئيسية', 'about.html': 'من نحن', 'services.html': 'الخدمات', 'work.html': 'الأعمال', 'project.html': 'مشروع',
  'feedback.html': 'آراء العملاء', 'contact.html': 'تواصل معنا', 'blog.html': 'المدونة', 'article.html': 'مقال',
  'careers.html': 'انضم لفريقنا', 'team.html': 'الفريق', 'profile.html': 'الملف التعريفي', 'privacy.html': 'الخصوصية',
};
const chPage = (p) => {
  const en = /^\/en\//.test(p || '');
  const name = CH_PAGES[String(p || '').replace(/^\/(en\/)?/, '').replace(/\/$/, '')] || p || '—';
  return `${name}${en ? ' (EN)' : ''}`;
};
let chFlagNames = null;
const chCountry = (code) => {
  if (!code) return '—';
  try { chFlagNames = chFlagNames || new Intl.DisplayNames(['ar'], { type: 'region' }); return chFlagNames.of(code) || code; } catch { return code; }
};
const chWa = (phone) => `https://wa.me/${String(phone || '').replace(/[^\d]/g, '').replace(/^00/, '')}`;

// the conversation itself: the visitor's questions on one side, Shater's answers on the other
function chTranscript(chat) {
  return h('div', { class: 'ch-log' }, ...chat.messages.flatMap((m) => [
    h('div', { class: 'ch-q', dir: 'auto' }, m.q, h('small', null, fmtDate(m.at))),
    h('div', { class: `ch-a${m.ok ? '' : ' ch-fail'}`, dir: 'auto' }, m.ok ? m.a : 'لم يُجب (خطأ في الاتصال بالذكاء الاصطناعي أو لم يكن مفعّلاً)'),
  ]));
}

// what the AI learned about a lead, as a list of facts (only the ones it found)
function chLeadFacts(lead, contact) {
  const phone = lead.phone || (contact && contact.phone) || '', email = lead.email || (contact && contact.email) || '';
  const rows = [
    ['الاسم', lead.name], ['الشركة', lead.company], ['المجال', lead.business], ['الحاجة', lead.need],
    ['الخدمات', (lead.services || []).join('، ')], ['الميزانية', lead.budget], ['المدة', lead.timeline], ['الموقع', lead.location],
  ].filter(([, v]) => v);
  return h('dl', { class: 'kv' },
    ...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', { dir: 'auto' }, v)]),
    phone ? [h('dt', null, 'الهاتف'), h('dd', null, h('a', { href: chWa(phone), class: 'ltr', target: '_blank', rel: 'noopener' }, phone))] : null,
    email ? [h('dt', null, 'البريد'), h('dd', null, h('a', { href: `mailto:${email}`, class: 'ltr' }, email))] : null);
}

/* ---------- محادثات شاطر ---------- */
async function viewChats(view) {
  setPending(null);
  const r = await api('GET', '/chats');
  let chats = r.chats, filter = 'all';
  const list = h('div', { class: 'msgs' });
  const chips = h('div', { class: 'row ch-filters' });
  const shown = () => chats.filter((c) => (filter === 'unread' ? !c.read : filter === 'leads' ? c.isLead : true));
  const drawChips = () => chips.replaceChildren(...[['all', 'الكل', chats.length], ['unread', 'غير مقروءة', chats.filter((c) => !c.read).length], ['leads', 'عملاء محتملون', chats.filter((c) => c.isLead).length]]
    .map(([k, label, n]) => h('button', { type: 'button', class: `btn btn-small${filter === k ? ' btn-primary' : ''}`, onclick: () => { filter = k; drawChips(); draw(); } }, `${label} (${n})`)));

  function item(c) {
    const body = h('div', { class: 'body' }, h('p', { class: 'muted small' }, 'جارٍ التحميل…'));
    const d = h('details', { class: `msg${c.read ? '' : ' unread'}` },
      h('summary', null, h('span', { class: 'dot', 'aria-hidden': 'true' }),
        h('span', { class: 'who', dir: 'auto' },
          c.who || 'زائر',
          c.isLead ? h('b', { class: `ch-pill ch-${c.temperature || 'cold'}` }, `عميل محتمل · ${(CH_TEMP[c.temperature] || CH_TEMP.cold)[0]}`) : null,
          h('small', null, ` — ${c.first.length > 70 ? `${c.first.slice(0, 70)}…` : c.first}`)),
        h('span', { class: 'when' }, `${fmtDate(c.updated)} · ${c.count} ${c.count === 1 ? 'سؤال' : c.count === 2 ? 'سؤالان' : 'أسئلة'}`)),
      body);
    let loaded = false;
    d.addEventListener('toggle', async () => {
      if (!d.open || loaded) return;
      loaded = true;
      try {
        const { chat } = await api('GET', `/chats/${c.id}`);
        body.replaceChildren(
          h('dl', { class: 'kv' },
            h('dt', null, 'بدأت'), h('dd', null, fmtDate(chat.started)),
            h('dt', null, 'الصفحة'), h('dd', null, chPage(chat.page)),
            h('dt', null, 'البلد'), h('dd', null, chCountry(chat.country)),
            h('dt', null, 'لغة الصفحة'), h('dd', null, chat.lang === 'en' ? 'الإنجليزية' : 'العربية')),
          chat.lead && chat.lead.isLead ? h('div', { class: 'ch-leadbox' }, h('b', null, 'عميل محتمل'), chat.lead.summary ? h('p', { dir: 'auto' }, chat.lead.summary) : null, h('a', { class: 'btn btn-small', href: '#/leads' }, 'افتح في العملاء المحتملين')) : null,
          chTranscript(chat),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn btn-small', onclick: async () => { try { await api('PATCH', `/chats/${c.id}`, { read: !c.read }); c.read = !c.read; d.classList.toggle('unread', !c.read); drawChips(); refreshMe().catch(() => {}); toast(c.read ? 'عُلّمت كمقروءة' : 'عُلّمت كغير مقروءة'); } catch (err) { toast(err.message, 'err'); } } }, 'مقروءة / غير مقروءة'),
            h('span', { class: 'spacer' }),
            h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: async () => {
              if (!await ask('حذف هذه المحادثة نهائياً؟', { yes: 'حذف', danger: true })) return;
              try { await api('DELETE', `/chats/${c.id}`); chats = chats.filter((x) => x !== c); drawChips(); draw(); refreshMe().catch(() => {}); toast('حُذفت المحادثة'); } catch (err) { toast(err.message, 'err'); }
            } }, 'حذف')));
        if (!c.read) { await api('PATCH', `/chats/${c.id}`, { read: true }); c.read = true; d.classList.remove('unread'); drawChips(); refreshMe().catch(() => {}); }
      } catch (err) { body.replaceChildren(h('p', { class: 'muted' }, err.message)); }
    });
    return d;
  }
  function draw() {
    const items = shown();
    list.replaceChildren(...(items.length ? items.map(item) : [h('p', { class: 'empty' }, chats.length ? 'لا شيء هنا.' : 'لا محادثات بعد. ما يكتبه الزوار لشاطر يظهر هنا.')]));
  }
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'SHATER'),
      h('h1', null, 'محادثات شاطر'),
      h('p', null, 'كل محادثة أجراها زائر مع شاطر، الأحدث أولاً. افتح المحادثة لتقرأها كاملة. ما يبدو منها شركةً أو عميلاً محتملاً يظهر أيضاً في «العملاء المحتملون» مع ما عرفناه عنه.'))),
    chips, list);
  drawChips();
  draw();
}

/* ---------- العملاء المحتملون ---------- */
async function viewLeads(view) {
  setPending(null);
  const r = await api('GET', '/leads');
  let leads = r.leads, filter = 'new';
  const list = h('div', { class: 'ch-leads' });
  const chips = h('div', { class: 'row ch-filters' });
  const drawChips = () => chips.replaceChildren(...[['new', CH_STATUS.new], ['contacted', CH_STATUS.contacted], ['won', CH_STATUS.won], ['lost', CH_STATUS.lost], ['all', 'الكل']]
    .map(([k, label]) => h('button', { type: 'button', class: `btn btn-small${filter === k ? ' btn-primary' : ''}`, onclick: () => { filter = k; drawChips(); draw(); } },
      `${label} (${k === 'all' ? leads.length : leads.filter((x) => x.status === k).length})`)));

  function card(x) {
    const L = x.lead, [tempLabel, tempKey] = CH_TEMP[L.temperature] || CH_TEMP.cold;
    const phone = L.phone || x.contact.phone || '';
    const status = h('select', { class: 'input', 'aria-label': 'حالة المتابعة', onchange: async (e) => {
      try { await api('PATCH', `/leads/${x.id}`, { status: e.target.value }); x.status = e.target.value; drawChips(); refreshMe().catch(() => {}); toast('حُفظت الحالة'); if (filter !== 'all') draw(); } catch (err) { toast(err.message, 'err'); }
    } }, ...Object.entries(CH_STATUS).map(([k, label]) => h('option', { value: k, selected: x.status === k }, label)));
    const note = h('textarea', { class: 'input', rows: 2, dir: 'auto', placeholder: 'ملاحظة خاصة بالفريق (لا يراها العميل)', value: x.note || '' });
    note.addEventListener('change', async () => { try { await api('PATCH', `/leads/${x.id}`, { note: note.value }); x.note = note.value; toast('حُفظت الملاحظة'); } catch (err) { toast(err.message, 'err'); } });
    const talk = h('div', { class: 'ch-talk', hidden: true });
    return h('article', { class: `card ch-lead ch-${tempKey}` },
      h('header', { class: 'ch-lead-head' },
        h('div', null,
          h('h3', { dir: 'auto' }, L.company || L.name || 'عميل بلا اسم بعد'),
          h('p', { class: 'muted small' }, `${L.company && L.name ? `${L.name} · ` : ''}${fmtDate(x.leadSince || x.updated)} · ${chCountry(x.country)} · ${chPage(x.page)}`)),
        h('b', { class: `ch-pill ch-${tempKey}` }, tempLabel)),
      L.summary ? h('p', { class: 'ch-summary', dir: 'auto' }, L.summary) : null,
      chLeadFacts(L, x.contact),
      h('div', { class: 'ch-lead-follow' }, h('label', { class: 'field' }, h('span', null, 'المتابعة'), status), h('label', { class: 'field' }, h('span', null, 'ملاحظة'), note)),
      talk,
      h('div', { class: 'row' },
        phone ? h('a', { class: 'btn btn-primary btn-small', href: chWa(phone), target: '_blank', rel: 'noopener' }, 'تواصل على واتساب') : h('span', { class: 'muted small' }, 'لم يترك رقماً بعد: شاطر يوجّهه إلى واتساب'),
        h('button', { type: 'button', class: 'btn btn-small', onclick: async (e) => {
          if (!talk.hidden) { talk.hidden = true; e.target.textContent = 'اقرأ المحادثة'; return; }
          try { const { chat } = await api('GET', `/chats/${x.id}`); talk.replaceChildren(chTranscript(chat)); talk.hidden = false; e.target.textContent = 'إخفاء المحادثة'; } catch (err) { toast(err.message, 'err'); }
        } }, 'اقرأ المحادثة'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: async () => {
          if (!await ask('إخراج هذه المحادثة من العملاء المحتملين؟ تبقى في «محادثات شاطر».', { yes: 'ليس عميلاً محتملاً' })) return;
          try { await api('PATCH', `/leads/${x.id}`, { lead: false }); leads = leads.filter((y) => y !== x); drawChips(); draw(); refreshMe().catch(() => {}); } catch (err) { toast(err.message, 'err'); }
        } }, 'ليس عميلاً محتملاً')));
  }
  function draw() {
    const items = leads.filter((x) => filter === 'all' || x.status === filter);
    list.replaceChildren(...(items.length ? items.map(card) : [h('p', { class: 'empty' }, leads.length ? 'لا عملاء في هذه الحالة.' : 'لا عملاء محتملين بعد. حين يتحدث مع شاطر صاحب شركة أو شخص يريد خدمة، يظهر هنا مع ما عرفناه عنه.')]));
  }
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'LEADS'),
      h('h1', null, 'العملاء المحتملون'),
      h('p', null, 'من تحدّث مع شاطر وبدا شركةً أو عميلاً يريد خدمة. بعد كل سؤال يقرأ الذكاء الاصطناعي المحادثة ويلخّص: من هو، وما يحتاجه، وميزانيته ومدته، وكيف نصل إليه. «جاهز للبدء» يعني أنه طلب سعراً أو بداية العمل.')),
      h('a', { class: 'btn btn-ghost', href: '#/chats' }, 'كل المحادثات')),
    chips, list);
  drawChips();
  draw();
}

VIEWS.chats = viewChats;
VIEWS.leads = viewLeads;
