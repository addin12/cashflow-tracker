// "Tanya apa saja": the box at the top of Ikhtisar. A sentence or one of the four buttons goes to the app's `ask` method; the answer comes back as data (numbers
// worked out from your own rows, see core/ask.js) and is worded here, in the person's language, with a button to the transactions behind it.
import { CHIPS } from '../core/ask.js';
import { dateLabel, esc, rangeLabel, rp } from './format.js';
import { show } from './router.js';
import { call } from './server.js';
import { $, T, state } from './state.js';

const lang = () => (state.boot && state.boot.lang === 'en' ? 'en' : 'id');

/** The card. What was asked and answered last stays on the screen when the page redraws (it is worded again each time, so "hide numbers" applies). */
export function askCard() {
  const q = state.ask ? state.ask.q : '';
  const chips = Object.values(CHIPS).map((c) => `<button class="chip" type="button" data-action="askchip" data-q="${esc(c[lang()])}">${esc(c[lang()])}</button>`).join('');
  return `<section class="card ask" aria-labelledby="askLabel">
    <form data-form="ask" class="ask-form" autocomplete="off">
      <label id="askLabel" class="ask-label" for="askIn">${esc(T.askTitle)}</label>
      <div class="ask-row"><input id="askIn" name="q" type="text" maxlength="160" enterkeyhint="send" value="${esc(q)}" placeholder="${esc(T.askPlaceholder)}"><button class="ask-go" type="submit" aria-label="${esc(T.askSend)}"><span aria-hidden="true">→</span></button></div>
    </form>
    <div class="ask-chips">${chips}</div>
    <div class="ask-out" id="askOut" role="status" aria-live="polite">${outHtml()}</div>
  </section>`;
}

const outHtml = () => {
  const a = state.ask;
  if (!a) return '';
  if (a.busy) return `<p class="ask-busy"><span class="spin" aria-hidden="true"></span> ${esc(T.askWorking)}</p>`;
  return a.answer ? answerHtml(a.answer) : '';
};
const paint = () => { const out = $('#askOut'); if (out) out.innerHTML = outHtml(); };

/** Sends a question. Chips fill the box first, so the person sees what was asked. */
export async function runAsk(text) {
  const q = String(text || '').trim().slice(0, 160);
  if (!q) return null;
  const input = $('#askIn');
  if (input) input.value = q;
  state.ask = { q, busy: true };
  paint();
  try {
    state.ask = { q, answer: await call('ask', { text: q }) };
  } catch (e) {
    state.ask = { q, answer: { kind: 'error' } };
  }
  paint();
  return null;
}

/** The transactions behind an answer: the same filters, in Transaksi. */
export function askDrill(el) {
  let f = {};
  try { f = JSON.parse(el.dataset.f || '{}'); } catch (e) { f = {}; }
  state.who = f.owner || ''; // the list shows the same people as the answer did
  state.filters = { q: f.q || '', month: '', from: f.from || '', to: f.to || '', stream: '', category: f.category || '', status: '', direction: f.direction || '', owner: state.who };
  state.limit = 50;
  return show('transactions');
}

// Wording an answer

const span = (a) => (a.from && a.to && a.from !== a.to ? rangeLabel(a.from, a.to) : a.from ? dateLabel(a.from, { weekday: false }) : '');
const what = (l = {}) => [l.category, l.merchant ? `“${l.merchant}”` : '', l.person].filter(Boolean).join(' · ');
const head = (title, sub = '') => `<h3 class="ask-head">${esc(title)}</h3>${sub ? `<p class="ask-sub">${esc(sub)}</p>` : ''}`;
const big = (n) => `<p class="ask-big"><b class="amt">${rp(n)}</b></p>`;
const lines = (items) => (items.length ? `<ul class="ask-list">${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
const row = (name, value, meta = '') => `<span class="ask-name">${esc(name)}${meta ? ` <span class="ask-meta">${esc(meta)}</span>` : ''}</span><b class="amt">${value}</b>`;
const drillBtn = (d) => (d ? `<button class="btn secondary ask-see" type="button" data-action="askdrill" data-f="${esc(JSON.stringify(d))}">${esc(T.askSeeRows)}</button>` : '');
const ai = (a) => (a.source === 'ai' ? `<p class="ask-ai">${esc(T.askAi)}</p>` : '');
const change = (diff, pct) => (diff === 0 ? T.askSame : diff > 0 ? T.askUp(rp(diff), pct) : T.askDown(rp(-diff), pct));
const wrap = (a, html) => `<div class="ask-ans">${html}${ai(a)}</div>`;

export function answerHtml(a) {
  switch (a.kind) {
    case 'spend': case 'income': {
      const sub = [what(a.label), T.askPeriod(a.period), span(a)].filter(Boolean).join(' · ');
      if (!a.count) return wrap(a, `${head(T.askHead(a.kind), sub)}<p class="ask-none">${esc(T.askNothing)}</p>`);
      return wrap(a, `${head(T.askHead(a.kind), sub)}${big(a.total)}${lines([
        esc(`${T.askCount(a.count)} · ${T.askPerDay(rp(a.perDay))}`),
        a.biggest ? esc(T.askBiggest(a.biggest.description, rp(a.biggest.amount), dateLabel(a.biggest.date, { weekday: false }))) : '',
        a.top.length ? esc(T.askTop(a.top.map((x) => `${x.name} ${rp(x.amount)}`).join(', '))) : '',
      ].filter(Boolean))}${drillBtn(a.drill)}`);
    }
    case 'compare': {
      const sub = [what(a.label)].filter(Boolean).join(' · ');
      return wrap(a, `${head(T.askHead('compare'), sub)}<ul class="ask-list ask-rows"><li>${row(T.askPeriod(a.a.period), rp(a.a.total), span(a.a))}</li><li>${row(T.askPeriod(a.b.period), rp(a.b.total), span(a.b))}</li></ul>
        <p class="ask-change ${a.diff > 0 ? 'up' : a.diff < 0 ? 'down' : ''}">${esc(change(a.diff, a.pct))}</p>${drillBtn(a.drill)}`);
    }
    case 'last': {
      if (!a.found) return wrap(a, `${head(T.askHead('last'), what(a.label))}<p class="ask-none">${esc(T.askNoMatch(what(a.label)))}</p>`);
      return wrap(a, `${head(T.askHead('last'), what(a.label))}<p class="ask-big"><b>${esc(dateLabel(a.date, { weekday: false }))}</b></p>
        ${lines([esc(T.askAgo(a.daysAgo)), esc(`${a.description} · ${rp(a.amount)}`), a.category ? esc(a.category) : ''].filter(Boolean))}`);
    }
    case 'bills': {
      const title = `${T.askHead('bills')} ${a.next ? T.askNextWeek : T.askThisWeek}`;
      if (!a.items.length) return wrap(a, `${head(title)}<p class="ask-none">${esc(T.askNoBills)}</p>`);
      return wrap(a, `${head(title)}${big(a.total)}<ul class="ask-list ask-rows">${a.items.map((b) => `<li>${row(b.name, rp(b.amount), b.date ? dateLabel(b.date, { weekday: false }) : '')}</li>`).join('')}</ul>`);
    }
    case 'subs': {
      if (!a.count) return wrap(a, `${head(T.askHead('subs'))}<p class="ask-none">${esc(T.askNoSubs)}</p>`);
      return wrap(a, `${head(T.askHead('subs'), T.askSubsCount(a.count))}<p class="ask-big"><b class="amt">${rp(a.monthlyTotal)}</b> <span class="ask-meta">${esc(T.askPerMonth)}</span></p>
        <ul class="ask-list ask-rows">${a.items.map((i) => `<li>${row(i.name, rp(i.amount), i.nextDate ? dateLabel(i.nextDate, { weekday: false }) : '')}</li>`).join('')}</ul>`);
    }
    case 'who': {
      const sub = [what(a.label), T.askPeriod(a.period), span(a)].filter(Boolean).join(' · ');
      const any = a.people.some((p) => p.total > 0);
      if (!any) return wrap(a, `${head(T.askHead('who'), sub)}<p class="ask-none">${esc(T.askNothing)}</p>`);
      return wrap(a, `${head(T.askHead('who'), sub)}<p class="ask-big"><b>${esc(a.people[0].name)}</b></p><ul class="ask-list ask-rows">${a.people.map((p) => `<li>${row(p.name, rp(p.total), T.askCount(p.count))}</li>`).join('')}</ul>${drillBtn(a.drill)}`);
    }
    case 'budget': {
      if (!a.set || !a.items.length) return wrap(a, `${head(T.askHead('budget'), a.category)}<p class="ask-none">${esc(T.askNoBudget(a.category))}</p>`);
      return wrap(a, `${head(T.askHead('budget'), a.category || span(a))}<ul class="ask-list ask-rows">${a.items.map((b) => `<li>${row(b.category, b.left >= 0 ? T.askLeft(rp(b.left), rp(b.budget)) : T.askOver(rp(-b.left), rp(b.budget)))}</li>`).join('')}</ul>`);
    }
    case 'where': {
      const sub = [T.askPeriod(a.period), span(a)].filter(Boolean).join(' · ');
      if (!a.count) return wrap(a, `${head(T.askHead('where'), sub)}<p class="ask-none">${esc(T.askNothing)}</p>`);
      return wrap(a, `${head(T.askHead('where'), sub)}${big(a.total)}<ul class="ask-list ask-rows">${a.top.map((x) => `<li>${row(x.name, rp(x.amount), `${x.pct}%`)}</li>`).join('')}</ul>${drillBtn(a.drill)}`);
    }
    case 'week': {
      const sub = span(a);
      return wrap(a, `${head(T.askHead('week'), sub)}${big(a.total)}${lines([
        esc(`${T.askCount(a.count)} · ${change(a.diff, a.previous.total > 0 ? Math.round((a.diff / a.previous.total) * 100) : null)} ${T.askVsLastWeek(rp(a.previous.total))}`),
        a.income > 0 ? esc(T.askIncomeLine(rp(a.income))) : '',
        a.top.length ? esc(T.askTop(a.top.map((x) => `${x.name} ${rp(x.amount)}`).join(', '))) : '',
        a.biggest ? esc(T.askBiggest(a.biggest.description, rp(a.biggest.amount), dateLabel(a.biggest.date, { weekday: false }))) : '',
        a.pending ? esc(T.askPending(a.pending)) : '',
      ].filter(Boolean))}${drillBtn(a.drill)}`);
    }
    case 'unknown': {
      const ex = [T.askExA, T.askExB, T.askExC].map((q) => `<button class="chip" type="button" data-action="askchip" data-q="${esc(q)}">${esc(q)}</button>`).join('');
      return `<div class="ask-ans"><p class="ask-none">${esc(T.askUnknown)}</p><div class="ask-chips">${ex}</div></div>`;
    }
    default: return `<div class="ask-ans"><p class="ask-none">${esc(T.askFailed)}</p></div>`;
  }
}
