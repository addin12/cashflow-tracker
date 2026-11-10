// The Settings screen: the list of sections, and the household, notification and Telegram sections.

import { svgIcon } from './icons.js';
import { setAll } from './data.js';
import { dateLabel, esc, locale, rp } from './format.js';
import { assetsForm, balanceForm, cardsForm, goalsForm, importForm, plansForm, previewRule } from './forms.js';
import { accountOptions, categoryOptions, field, setView, skeleton, streamLabel } from './render.js';
import { call, save } from './server.js';
import { $$, T, state } from './state.js';
import { shownOrder } from './accountorder.js';
import { readTheme } from './theme.js';
import { tag } from './visuals.js';

/** Settings → Telegram: your own bot, and which chats may log by it. */
function telegramSection(s) {
  const t = s.telegram;
  if (!t) return `<section class="card"><h2>${esc(T.tgTitle)}</h2><p class="lead">${esc(T.tgNotSetUp)}</p></section>`;
  if (!t.configured) {
    return `<form class="card" data-form="telegramtoken" novalidate><h2>${esc(T.tgTitle)}</h2><p class="lead">${esc(T.tgIntro)}</p>
      <ol>${T.tgSteps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${field(T.tgToken, '<input name="token" type="password" autocomplete="off" spellcheck="false" placeholder="123456789:AAH…">', { help: T.tgTokenHelp })}
      <div class="actions"><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.tgSave)}</button></div></form>`;
  }
  const mine = t.chats.some((c) => c.mine);
  const chats = t.chats.map((c) => `<div class="rowi"><span class="what"><b>${esc(c.label)}</b><span class="meta">${esc([c.owner, c.at ? T.notifSince(dateLabel(c.at.slice(0, 10), { weekday: false })) : ''].filter(Boolean).join(' · '))}</span></span></div>`).join('');
  return `<section class="card"><h2>${esc(T.tgTitle)}</h2><p class="lead">${esc(T.tgBot(t.username))}</p>
      ${chats ? `<div class="rows">${chats}</div>` : `<p class="hint">${esc(T.tgNoChats)}</p>`}
      <div class="actions" style="justify-content:flex-start">${t.link ? `<a class="btn primary" target="_blank" rel="noopener" href="${esc(t.link)}">${esc(mine ? T.tgLinkAgain : T.tgLinkBtn)}</a>` : ''}${mine ? `<button class="btn secondary" type="button" data-action="tgunlink">${esc(T.tgUnlink)}</button>` : ''}</div>
      <p class="hint">${esc(T.tgLinkHint)}</p><h3 class="sub-title">${esc(T.tgUsageTitle)}</h3><p class="hint pre">${esc(T.tgUsage)}</p></section>
    <section class="card"><div class="actions" style="justify-content:flex-start"><button class="btn danger" type="button" data-action="tgremove">${esc(T.tgRemove)}</button></div><p class="hint">${esc(T.tgRemoveHint)}</p></section>`;
}

/** Settings → Pasangan: both of you, the same for each. Either of you can change any of it. */
function householdSection(s) {
  const h = s.household || {};
  const when = (c) => (c.at ? new Date(c.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : T.none);
  const card = (m, i) => {
    const mine = m.role === h.myRole;
    return `<fieldset class="acct-row hh-member" data-role="${m.role}"><legend>${esc(m.name || T.hhNobody)}${mine ? ` · ${esc(T.hhYouTag)}` : ''}</legend>
      <div class="fields2">
        ${field(T.hhName, `<input name="${m.role}_name" autocomplete="off" value="${esc(m.name)}">`)}
        ${field(T.hhEmail, `<input name="${m.role}_emails" type="email" multiple inputmode="email" autocomplete="off" spellcheck="false" value="${esc(m.emails.join(', '))}">`, { help: i === 0 ? T.hhEmailHelp : '' })}
        ${field(T.hhBankNames, `<input name="${m.role}_bank" autocomplete="off" value="${esc(m.bankNames)}">`, { help: i === 0 ? T.hhBankNamesHelp : '', wide: true })}
      </div>
      ${(m.gmails || []).length ? m.gmails.map((g) => `<p class="hint ${g.connected && !g.problem ? 'ok-text' : ''}">${esc(!g.connected ? T.hhGmailNo(g.email) : g.problem ? T.hhGmailProblem(g.email, g.problem) : T.hhGmailOk(g.email, when(g)))}</p>`).join('') : `<p class="hint">${esc(T.hhPartnerNotYet)}</p>`}
      ${mine && !h.myGmailConnected ? `<div class="actions" style="justify-content:flex-start"><button class="btn primary" type="button" data-action="connectme">${esc(T.hhConnect)}</button></div><p class="hint">${esc(T.hhConnectHint)}</p>` : ''}
    </fieldset>`;
  };
  return `<form class="card" data-form="household" novalidate><h2>${esc(T.hhTitle)}</h2><p class="lead">${esc(T.hhHint)}</p>
    ${(h.members || []).map(card).join('')}
    ${(h.members || []).length > 1 && (h.members[1].emails || []).length ? field(T.hhSplit(h.members[0].name), `<input name="split" type="number" min="1" max="99" inputmode="numeric" value="${esc(h.split || 50)}">`, { help: T.hhSplitHelp }) : ''}
    <details class="howto"><summary>${esc(T.hhStepsTitle)}</summary><ol>${T.hhSteps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>
    <p class="hint">${esc(T.hhAccountsHint)}</p>
    <div class="actions"><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveChanges)}</button></div></form>`;
}

/** Phone notifications: the phones that joined, which things notify, a test. */
export const NOTIF_EVENTS = ['new', 'big', 'bills', 'payday', 'close'];

function notifSection(s) {
  const p = s.push;
  if (!p) return `<section class="card"><h2>${esc(T.notifTitle)}</h2><p class="lead">${esc(T.notifNotSetUp)}</p></section>`;
  const devs = p.devices.sort((a, b) => Number(b.mine) - Number(a.mine)).map((d) => `<div class="rowi"><span class="what"><b>${esc(d.label || T.notifDevice)}</b><span class="meta">${esc([d.owner, T.notifSince(d.at ? dateLabel(d.at.slice(0, 10), { weekday: false }) : T.none)].filter(Boolean).join(' · '))}</span></span></div>`).join('');
  return `<section class="card"><h2>${esc(T.notifTitle)}</h2><p class="lead">${esc(T.notifPushHint)}</p>
      ${devs ? `<div class="rows">${devs}</div>` : `<p class="hint">${esc(T.notifNone)}</p>`}
      <div class="actions" style="justify-content:flex-start"><a class="btn primary" target="_top" href="${esc(p.link)}">${esc(T.notifAdd)}</a>${devs ? `<button class="btn secondary" type="button" data-action="pushtest">${esc(T.notifTest)}</button>` : ''}</div>
      <p class="hint">${esc(T.notifIphone)}</p></section>
    <form class="card" data-form="notif" novalidate><h2>${esc(T.notifWhat)}</h2>
      ${NOTIF_EVENTS.map((k) => `<label class="check switch"><input type="checkbox" name="push_${k}" ${p.events.includes(k) ? 'checked' : ''}> ${esc(T[`notif_${k}`])}</label>`).join('')}
      <div class="actions">${devs ? `<button class="btn danger left" type="button" data-action="pushforget">${esc(T.notifForget)}</button>` : ''}<span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveChanges)}</button></div></form>`;
}

export async function viewSettings(local) {
  // `local`: re-render from unsaved local data (e.g. after "add account") without a server round trip.
  if (!local) skeleton(T.tabSettings, 'settings');
  const s = local || await call('settings');
  if (state.tab !== 'settings') return;
  if (state.prefillAccount) { // from "Perlu perhatian": an account the emails mention, with its bank and number filled in
    const p = state.prefillAccount;
    state.prefillAccount = null;
    if (!s.accounts.some((a) => a.institution === p.institution && a.match_hint === p.match_hint)) {
      const taken = s.accounts.some((a) => a.stream === p.institution);
      s.accounts = [...s.accounts, { stream: taken ? `${p.institution} ${state.boot.me}` : p.institution, type: 'Spending', owner: state.boot.me, institution: p.institution, match_hint: p.match_hint, opening_balance: 0 }];
    }
  }
  state.settings = s;
  const cfg = s.config;
  const saveRow = (label) => `<div class="actions"><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(label)}</button></div>`;
  const acc = shownOrder(s.accounts, state.boot.me, (state.boot.members || [])[0]).map((a, i) => `
    <fieldset class="acct-row acct" data-i="${i}" data-orig="${a._orig}"><legend>${esc(a.stream ? streamLabel(a.stream) : T.newAccount)}</legend>
      <div class="fields2">
        ${field(T.accountName, `<input data-a="stream" value="${esc(a.stream)}">`)}
        ${field(T.accountType, `<select data-a="type"><option value="Spending" ${a.type === 'Spending' ? 'selected' : ''}>${esc(T.typeSpending)}</option><option value="Saving" ${a.type === 'Saving' ? 'selected' : ''}>${esc(T.typeSaving)}</option></select>`)}
        ${field(T.bank, `<input data-a="institution" value="${esc(a.institution)}">`, { help: T.optional })}
        ${(state.boot.members || []).length > 1 ? field(T.accountOwner, `<select data-a="owner">${state.boot.members.map((n) => `<option ${n === (a.owner || state.boot.members[0]) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`, { help: T.accountOwnerHelp }) : ''}
        ${field(T.openingBalance, `<input data-a="opening_balance" type="number" inputmode="decimal" step="any" value="${esc(a.opening_balance)}">`)}
        ${field(T.hints, `<input data-a="match_hint" value="${esc(a.match_hint)}">`, { help: T.hintsHelp, wide: true })}
      </div>
      <div class="actions"><button class="btn danger small" type="button" data-action="delacct" data-i="${i}">${esc(T.deleteAccount)}</button></div></fieldset>`).join('');
  // Rule previews need every transaction: fetched if missing or out of date, then the previews redrawn.
  if (!state.all || state.allStale) call('list', { limit: 1000000 }).then((r) => { setAll(r.rows); $$('.rule').forEach(previewRule); }).catch(() => {});
  const rules = s.rules.map((r, i) => `
    <fieldset class="acct-row rule" data-i="${i}"><legend>${tag(r.category)}</legend>
      <div class="fields2">
        ${field(T.rulePattern, `<input data-r="pattern" value="${esc(r.pattern)}" autocomplete="off" spellcheck="false">`, { help: T.rulePatternHelp })}
        ${field(T.category, `<select data-r="category">${categoryOptions(r.category, 'out')}</select>`)}
      </div>
      <label class="check switch"><input type="checkbox" data-r="auto_approve" ${r.auto_approve === true || r.auto_approve === 'TRUE' ? 'checked' : ''}> ${esc(T.autoApprove)}</label>
      <p class="hint rule-preview" role="status">${esc(T.hits(Number(r.hits) || 0))}</p>
      <div class="actions"><button class="btn danger small" type="button" data-action="delrule" data-i="${i}">${esc(T.deleteRule)}</button></div>
    </fieldset>`).join('');
  const budgets = s.categories.expense.map((c) => {
    const b = s.budgets.find((x) => x.category === c);
    const tip = (s.budgetSuggestions || []).find((x) => x.category === c);
    return field(c, `<input data-b="${esc(c)}" type="number" inputmode="decimal" step="any" min="0" value="${esc(b ? b.monthly_budget : '')}" placeholder="0">`, { help: tip ? T.budgetSuggest(rp(tip.amount), tip.months) : '' });
  }).join('');
  const conns = (s.connections || []).map((c) => {
    const st = String(c.last_status || '');
    const failed = /^ERROR/.test(st);
    const note = !c.last_sync ? T.neverSynced : failed ? `${T.syncProblem}: ${st.replace(/^ERROR:s*/, '').split(' | ')[0]}` : T.syncHealthy;
    const at = c.last_sync ? new Date(c.last_sync).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="rowi"><span class="what"><b>${esc(c.gmail)}</b><span class="meta">${at ? `${esc(T.lastSync)} ${esc(at)} · ` : ''}${failed ? `<span class="badge bad">${svgIcon('alert')} ${esc(note)}</span>` : `<span class="badge ok">✓ ${esc(note)}</span>`}</span></span></div>`;
  }).join('');
  // One section at a time (Apple Settings style): the list of sections, then the open one. On a
  // phone the list and the section are two screens; on a PC the list stays on the left.
  const sections = {
    monthend: balanceForm(s),
    import: importForm(s),
    plans: plansForm(s),
    assets: assetsForm(s),
    cards: cardsForm(s),
    notif: notifSection(s),
    telegram: telegramSection(s),
    household: householdSection(s),
    sync: `
      <section class="card"><h2>${esc(T.settingsSync)}</h2><p class="lead">${esc(T.settingsSyncHint)}</p><div class="rows">${conns}</div>
        <div class="actions"><button class="btn primary" type="button" data-action="sync">↻ ${esc(T.syncNow)}</button></div></section>`,
    accounts: `
      <form class="card" data-form="accounts" novalidate><h2>${esc(T.accountsTitle)}</h2><p class="lead">${esc(T.accountsTitleHint)}</p>${acc}
        <div class="actions"><button class="btn secondary left" type="button" data-action="addacct">＋ ${esc(T.addAccount)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveAccounts)}</button></div></form>`,
    budgets: `
      <form class="card" data-form="budgets" novalidate><h2>${esc(T.budgetsTitle)}</h2><p class="lead">${esc(T.budgetsHint)}</p><div class="budget-grid">${budgets}</div>
        <div class="actions">${(s.budgetSuggestions || []).length ? `<button class="btn secondary left" type="button" data-action="fillbudgets">${esc(T.fillBudgets)}</button>` : ''}<span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveBudgets)}</button></div></form>`,
    categories: `
      <form class="card" data-form="categories" novalidate><h2>${esc(T.categoriesTitle)}</h2><p class="lead">${esc(T.categoriesHint)}</p>
        <div class="fields2">
          ${field(T.incomeCats, `<textarea name="income" rows="7">${esc(s.categories.income.join('\n'))}</textarea>`, { help: T.onePerLine })}
          ${field(T.expenseCats, `<textarea name="expense" rows="14">${esc(s.categories.expense.join('\n'))}</textarea>`, { help: T.onePerLine })}
        </div>${saveRow(T.saveCategories)}</form>`,
    rules: `
      <form class="card" data-form="rules" novalidate><h2>${esc(T.rulesTitle)}</h2><p class="lead">${esc(T.rulesHint)}</p>${rules || `<p class="hint">${esc(T.noRules)}</p>`}
        <div class="actions"><button class="btn secondary left" type="button" data-action="addrule">＋ ${esc(T.addRule)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveRules)}</button></div></form>`,
    emails: `
      <form class="card" data-form="weekly" novalidate><h2>${esc(T.emailsTitle)}</h2><p class="lead">${esc(T.emailsHint)}</p>
        <label class="check switch"><input type="checkbox" name="weekly_email" ${cfg.weekly_email !== 'off' ? 'checked' : ''}> ${esc(T.weeklyOn)}</label>
        <label class="check switch"><input type="checkbox" name="monthly_email" ${cfg.monthly_email !== 'off' ? 'checked' : ''}> ${esc(T.monthlyOn)}</label>
        <label class="check switch"><input type="checkbox" name="payday_email" ${cfg.payday_email !== 'off' ? 'checked' : ''}> ${esc(T.paydayOn)}</label>
        <label class="check switch"><input type="checkbox" name="bill_email" ${cfg.bill_email !== 'off' ? 'checked' : ''}> ${esc(T.billEmailOn)}</label>
        <label class="check switch"><input type="checkbox" name="close_email" ${cfg.close_email === 'on' ? 'checked' : ''}> ${esc(T.closeEmailOn)}</label>
        <label class="check switch"><input type="checkbox" name="calendar_sync" ${cfg.calendar_sync === 'on' ? 'checked' : ''}> ${esc(T.calendarOn)}</label>
        ${cfg.calendar_status ? `<p class="hint">${esc(T.calendarStatus(cfg.calendar_status))}</p>` : ''}
        <p class="hint">${esc(T.noteEmailHint)}</p>
        <p class="hint">${esc(T.alertsAlways)}</p>
        <div class="actions"><button class="btn secondary left" type="button" data-action="sendsummary">${esc(T.weeklySendNow)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveChanges)}</button></div></form>`,
    prefs: `
      <form class="card" data-form="config" novalidate><h2>${esc(T.preferences)}</h2>
        <div class="fields2" style="margin-top:12px">
          ${field(T.language, `<select name="language"><option value="" ${!cfg.language ? 'selected' : ''}>${esc(T.languageAuto)}</option><option value="id" ${cfg.language === 'id' ? 'selected' : ''}>Bahasa Indonesia</option><option value="en" ${cfg.language === 'en' ? 'selected' : ''}>English</option></select>`)}
          ${field(T.payday, `<input name="payday_day" type="number" min="1" max="31" value="${esc(cfg.payday_day)}">`, { help: s.household && !s.household.isOwner ? T.paydayHelpOwn : T.paydayHelp })}
          ${field(T.summaryPeriod, `<select name="summary_period"><option value="month" ${cfg.summary_period !== 'payday' ? 'selected' : ''}>${esc(T.periodMonth)}</option><option value="payday" ${cfg.summary_period === 'payday' ? 'selected' : ''}>${esc(T.periodPayday(Number(cfg.payday_day) || 28))}</option></select>`, { help: T.summaryPeriodHelp, wide: true })}
          ${field(T.claimDays, `<input name="claim_days" type="number" inputmode="numeric" min="1" max="365" value="${esc(cfg.claim_days)}">`, { help: T.claimDaysHelp })}
          ${field(T.bigAmount, `<input name="big_amount" type="number" inputmode="decimal" step="any" min="0" value="${esc(cfg.big_amount)}">`, { help: T.bigAmountHelp })}
          ${field(T.salarySettings, `<select name="salary_stream">${accountOptions(cfg.salary_stream, T.chooseAccount)}</select>`, { help: T.salarySettingsHelp })}
          ${field(T.salaryAmountSetting, `<input name="salary_amount" type="number" inputmode="decimal" step="any" min="0" value="${esc(cfg.salary_amount)}">`, { help: T.salaryAmountSettingHelp })}
          ${field(T.ownerNames, `<input name="owner_bank_names" value="${esc(cfg.owner_bank_names)}">`, { help: T.ownerNamesHelp, wide: true })}
          ${field(T.themeLabel, `<select name="theme">${[['auto', T.themeAuto], ['light', T.themeLight], ['dark', T.themeDark]].map(([v, l]) => `<option value="${v}" ${readTheme() === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`, { help: T.themeHelp })}
        </div>${saveRow(T.saveChanges)}</form>`,
    more: `
      <section class="card"><h2>${esc(T.more)}</h2>
        <div class="rows"><div class="rowi"><span class="what"><b>${esc(T.selftest)}</b><span class="meta">${esc(s.selftest || T.noName)}</span></span></div>
          ${s.push ? `<a class="rowi" target="_top" href="${esc(s.push.site)}/pasang"><span class="what"><b>${esc(T.installTitle)}</b><span class="meta">${esc(T.installHint)}</span></span><span class="chev">↗</span></a>` : ''}
          ${(s.archives || []).map((a) => `<a class="rowi" target="_blank" rel="noopener" href="${esc(a.url)}"><span class="what"><b>${esc(T.archiveOf(a.year))}</b><span class="meta">${esc(T.archiveHint)}</span></span><span class="chev">↗</span></a>`).join('')}</div>
        <div class="actions"><a class="btn secondary" target="_blank" rel="noopener" href="${esc(state.boot.sheetUrl || '#')}">${esc(T.openSheet)} ↗</a></div></section>`,
    goals: goalsForm(s),
  };
  const conn = (s.connections || [])[0];
  const syncNote = !conn || !conn.last_sync ? T.neverSynced : /^ERROR/.test(String(conn.last_status || '')) ? T.syncProblem : T.syncHealthy;
  const emailsOn = ['weekly_email', 'monthly_email', 'payday_email', 'bill_email'].filter((k) => cfg[k] !== 'off').length + (cfg.close_email === 'on' ? 1 : 0);
  const lang = cfg.language === 'en' ? 'English' : cfg.language === 'id' ? 'Bahasa Indonesia' : T.languageAuto;
  const groups = [
    [T.setGroupRoutine, [['monthend', T.monthEnd, T.monthEndShort], ['import', T.importTitle, (s.imports || []).length ? T.importLast(new Date(s.imports[0].at).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })) : T.importNever], ['sync', T.settingsSync, syncNote]]],
    [T.setGroupMoney, [['accounts', T.accountsTitle, T.nAccounts(s.accounts.length)], ['budgets', T.budgetsTitle, T.nBudgets(s.budgets.length)], ['goals', T.goalsTitle, T.nGoals((s.goals || []).length)], ['assets', T.assetsTitle, T.nAssets((s.assets || []).length)], ['cards', T.cardsTitle, T.nCards((s.cards || []).length)]]],
    [T.setGroupAuto, [['categories', T.categoriesTitle, T.nCategories(s.categories.income.length, s.categories.expense.length)], ['rules', T.rulesTitle, T.nRules(s.rules.length)], ['plans', T.plansTitle, T.nPlans((s.plans || []).length)], ['emails', T.emailsTitle, T.nEmailsOn(emailsOn, 5)], ['notif', T.notifTitle, s.push ? T.nDevices(s.push.devices.length) : T.notifOff], ['telegram', T.tgTitle, s.telegram && s.telegram.configured ? T.nChats(s.telegram.chats.length) : T.tgOff]]],
    [T.setGroupApp, [['household', T.hhTitle, ((s.household && s.household.members.find((m) => m.role !== s.household.myRole)) || {}).name || T.hhNone], ['prefs', T.preferences, T.prefSummary(lang, Number(cfg.payday_day) || 28)], ['more', T.more, T.moreSummary]]],
  ];
  if (state.settingsSection && !sections[state.settingsSection]) state.settingsSection = null;
  const open = state.settingsSection || 'monthend';
  const index = groups.map(([g, rows]) => `<h2 class="set-group">${esc(g)}</h2><div class="card rows set-list">${rows.map(([k, label, sum]) => `
    <button class="rowi set-row ${k === open ? 'on' : ''}" data-action="setsection" data-section="${k}" ${k === open ? 'aria-current="true"' : ''}>
      <span class="what"><b>${esc(label)}</b><span class="meta">${esc(sum)}</span></span><span class="chev" aria-hidden="true">›</span></button>`).join('')}</div>`).join('');
  setView(`<div class="settings ${state.settingsSection ? 'show-detail' : ''}">
    <header class="page-head set-head"><div><h1>${esc(T.tabSettings)}</h1><p class="sub">${esc(T.settingsSub)}</p></div></header>
    <nav class="set-index" aria-label="${esc(T.tabSettings)}">${index}</nav>
    <div class="set-detail"><button class="btn plain set-back" type="button" data-action="setsection" data-section="">‹ ${esc(T.tabSettings)}</button>
${sections[open]}
    </div></div>`);
  $$('.rule').forEach(previewRule);
}

/** Settings forms: the button shows the save, and the result appears next to it. */
export async function saveForm(form, name, payload, after) {
  const btn = form.querySelector('button[type=submit]');
  const st = form.querySelector('.state');
  btn.disabled = true;
  st.className = 'state'; st.textContent = T.saving;
  try {
    const r = await save(name, payload);
    st.className = 'state ok'; st.textContent = `✓ ${T.saved}`;
    if (after) await after(r);
  } catch (e) {
    st.className = 'state bad'; st.textContent = `${T.notSaved}: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}
