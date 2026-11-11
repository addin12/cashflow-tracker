// What the page does when something is tapped, submitted or changed.

import { isShared, toggleSharedTag } from '../core/shared.js';
import { validToken } from '../core/telegram.js';
import { renamedCategories } from '../core/app.js';
import { buildCategorySlots } from '../core/categories.js';
import { compileRule } from '../core/rules.js';
import { amountValue, showCalc, submitAdd, useUsual, viewAdd } from './add.js';
import { copyRecap, openBills, openInterest, openSpt, openSubs, openTagBudget, sptCsv } from './cards.js';
import { viewDashboard } from './dashboard.js';
import { patchRow, setAll } from './data.js';
import { openEditor, tagihForm, updateTagih } from './editor.js';
import { closeModal, trigger } from './modal.js';
import { rp } from './format.js';
import { storedOrder } from './accountorder.js';
import { importChosen, readAccounts, readAssets, readBackup, readCards, readGoals, readPlans, readRules, readStatement, sendSummaryNow, updateBalRow } from './forms.js';
import { applyLanguage } from './language.js';
import { goNotification, openNotifications } from './notifications.js';
import { categoryOptions, dismissToast, fieldMessage, keepInputs, repaint, toast, updateHideBtn, updateNav } from './render.js';
import { approve, fillBudgets, hideRecurring, ignore, saveSalary, skipSalary, viewReview } from './review.js';
import { show } from './router.js';
import { call, refresh, save, scheduleRefresh, syncNow } from './server.js';
import { NOTIF_EVENTS, saveForm, viewSettings } from './settings.js';
import { openSplit, splitRow, splitSummary, submitSplit, unsplit, updateSplitLeft } from './split.js';
import { $, $$, HIDE_KEY, T, state } from './state.js';
import { installApp } from './install.js';
import { applyLook, saveLook } from './look.js';
import { tourStep } from './tour.js';
import { applyTheme, toggleTheme } from './theme.js';
import { applyPicked, drill, exportCsv, setKind, setPreset, showResults, viewTransactions } from './transactions.js';

/** Every budget, with the fields of the view on screen (Kita or one person) read back into the list. */
function mergeBudgetForm(form) {
  const scope = state.budgetScope || '';
  const others = (state.settings.budgets || []).filter((b) => String(b.scope || '') !== scope);
  const here = $$('[data-b]', form).map((i) => ({ category: i.dataset.b, monthly_budget: Number(i.value) || 0, scope })).filter((b) => b.monthly_budget > 0); // an empty field is no budget
  return [...others, ...here];
}

export function onClick(e) {
  if (e.target.closest('[data-toast=undo]')) {
    const item = e.target.closest('.toast');
    const u = item && item.undo;
    dismissToast(item);
    if (u) u();
    return null;
  }
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-action],[data-tab]');
  if (el && !$('#modal').classList.contains('open')) trigger.el = el; // where focus returns when a pop-up opened by this closes
  if (!el) return null;
  const a = el.dataset.action;
  const card = el.closest('[data-id]');
  if (!a || a === 'go') {
    if (el.dataset.tab === 'settings') state.settingsSection = el.dataset.section || null;
    return show(el.dataset.tab);
  }
  if (a === 'setsection') {
    state.settingsSection = el.dataset.section || null;
    viewSettings(state.settings);
    if (typeof window.scrollTo === 'function') try { window.scrollTo(0, 0); } catch (err) { /* not available */ }
    return null;
  }
  if (a === 'notifgo') return goNotification(el);
  if (a === 'reload') return show(state.tab);
  if (a === 'reloadpage') { window.location.reload(); return null; }
  if (a === 'setmonth') { state.month = el.dataset.month; return show('dashboard'); }
  if (a === 'drill') return drill(el);
  if (a === 'kind') { state.addKind = el.dataset.kind; return viewAdd(); }
  if (a === 'more') { state.limit += 50; return showResults(); }
  if (a === 'trendmonth') { state.filters.month = state.filters.month === el.dataset.month ? '' : el.dataset.month; state.filters.from = ''; state.filters.to = ''; state.limit = 50; return viewTransactions(); }
  if (a === 'togglefilters') {
    state.filtersOpen = !state.filtersOpen;
    el.closest('.filters').classList.toggle('open', state.filtersOpen);
    el.setAttribute('aria-expanded', String(state.filtersOpen));
    return null;
  }
  if (a === 'unfilter') {
    if (el.dataset.key === 'period') { state.filters.from = ''; state.filters.to = ''; } else state.filters[el.dataset.key] = '';
    state.limit = 50;
    return viewTransactions();
  }
  if (a === 'resetfilters') { state.filters = { q: '', month: '', from: '', to: '', stream: '', category: '', status: '', direction: '' }; state.limit = 50; return viewTransactions(); }
  if (a === 'preset') { setPreset(el.dataset.p); state.limit = 50; return viewTransactions(); }
  if (a === 'kindchip') { setKind(el.dataset.k); state.limit = 50; return viewTransactions(); }
  if (a === 'dashview') { state.dashView = el.dataset.view; return viewDashboard(); }
  if (a === 'usual') return useUsual(Number(el.dataset.i));
  if (a === 'bills') return openBills();
  if (a === 'tagbudget') return openTagBudget(el.dataset.tag || '', el.dataset.budget || '');
  if (a === 'closeday' || a === 'reopenday') {
    const r = state.review;
    const date = el.dataset.date || state.boot.today;
    if (r && r.day && date !== state.boot.today) { delete r.day.yesterday; r.day.streak += 1; keepInputs(viewReview); } else if (r && r.day) { r.day.closed = a === 'closeday'; if (r.day.closed) r.day.streak += 1; else r.day.streak = Math.max(0, r.day.streak - 1); keepInputs(viewReview); }
    if (a === 'closeday') toast(date === state.boot.today ? T.dayClosedToast : T.dayYesterdayClosed);
    return save(a === 'closeday' ? 'closeDay' : 'reopenDay', { date })
      .then((res) => { if (state.review) { state.review.day = { ...state.review.day, ...res }; if (state.tab === 'review') keepInputs(viewReview); } })
      .catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }));
  }
  if (a === 'calckey') { const i = el.closest('form').querySelector('[name=amount]'); i.value += el.dataset.k; i.focus(); showCalc(i); return null; }
  if (a === 'tagihopen') { const x = state.rowsById.get(String(el.dataset.id)); $('#tagihBox').innerHTML = tagihForm(x); $('#tagihBox [name=who]').focus(); return null; }
  if (a === 'owedpaid') {
    const id = el.dataset.id;
    const d = state.dashByMonth[state.month];
    const before = d && d.owed ? JSON.parse(JSON.stringify(d.owed)) : null;
    if (d && d.owed) { const o = d.owed.open.find((x) => x.id === id); d.owed.open = d.owed.open.filter((x) => x.id !== id); if (o) d.owed.total -= o.amount; viewDashboard(); }
    toast(T.owedMarked, { undo: () => { save('owedSet', { id, status: 'open' }).catch(() => {}); if (d && before) { d.owed = before; viewDashboard(); } } });
    return save('owedSet', { id, status: 'paid' }).catch((err) => { if (d && before) { d.owed = before; viewDashboard(); } toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); });
  }
  if (a === 'subs') return openSubs();
  if (a === 'submark') {
    const d = state.dashByMonth[state.month];
    const it = d && d.recurring.items.find((i) => i.name === el.dataset.name);
    if (d && it) { d.recurringMarks = { ...(d.recurringMarks || {}) }; if (el.dataset.mark) d.recurringMarks[it.key] = el.dataset.mark; else delete d.recurringMarks[it.key]; }
    openSubs();
    return save('markRecurring', { name: el.dataset.name, mark: el.dataset.mark }).catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }));
  }
  if (a === 'addplan' || a === 'delplan') {
    state.settings.plans = readPlans(el.closest('form'));
    if (a === 'addplan') state.settings.plans.push({ name: '', amount: '', direction: 'out', stream: '', category: '', day: '', auto: false });
    else state.settings.plans.splice(Number(el.dataset.i), 1);
    viewSettings(state.settings);
    if (a === 'addplan') { const n = $$('.plan-row [data-p=name]'); if (n.length) n[n.length - 1].focus(); }
    return null;
  }
  if (a === 'addcard' || a === 'delcard') {
    state.settings.cards = readCards(el.closest('form'));
    if (a === 'addcard') state.settings.cards.push({ stream: '', statement: '', due: '' });
    else state.settings.cards.splice(Number(el.dataset.i), 1);
    viewSettings(state.settings);
    return null;
  }
  if (a === 'interest') return openInterest();
  if (a === 'tgunlink' || a === 'tgremove') {
    if (a === 'tgremove' && !window.confirm(T.tgRemoveAsk)) return null;
    return call(a === 'tgunlink' ? 'telegramUnlink' : 'telegramRemove').then(async () => { toast(a === 'tgunlink' ? T.tgUnlinked : T.tgRemoved); viewSettings(await call('settings')); })
      .catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }));
  }
  if (a === 'toggleshared') {
    const input = el.closest('form') && el.closest('form').querySelector('[name=details]');
    if (input) {
      input.value = toggleSharedTag(input.value);
      const on = isShared({ details: input.value });
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', String(on));
    }
    return null;
  }
  if (a === 'settle' || a === 'unsettle') {
    el.disabled = true;
    return save(a === 'settle' ? 'settleUp' : 'undoSettlement', a === 'settle' ? { amount: el.dataset.amount } : { id: el.dataset.id })
      .then(() => { state.dashByMonth = {}; toast(a === 'settle' ? T.sharedSettled : T.sharedUndone); if (state.tab === 'dashboard') viewDashboard(); })
      .catch((err) => { el.disabled = false; toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); });
  }
  if (a === 'claim') {
    const id = el.dataset.id;
    const status = el.dataset.status;
    const x = state.rowsById.get(String(id));
    if (x) { x.claim = status || undefined; if (!status) delete x.claimDue; }
    if (state.all) state.allStale = state.allStale || false;
    state.dashByMonth = {};
    openEditor(id);
    return save('markClaim', { id, status }).then((r) => { const row = state.rowsById.get(String(id)); if (row && r && r.due) row.claimDue = r.due; if (row && state.all) { const i = state.all.findIndex((z) => String(z.id) === String(id)); if (i >= 0) state.all[i] = row; } if ($('#claimBox')) openEditor(id); toast(status === 'open' ? T.claimMarked : status ? T.claimSaved : T.claimCleared); })
      .catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }));
  }
  if (a === 'recap') { state.dashView = 'report'; state.reportYearly = true; state.month = state.boot.today.slice(0, 7); return show('dashboard'); }
  if (a === 'copyrecap') return copyRecap();
  if (a === 'who') { state.who = el.dataset.who; state.filters.owner = state.who; state.dashByMonth = {}; return show(state.tab); }
  if (a === 'connectme') {
    el.disabled = true;
    el.textContent = T.hhConnecting;
    return call('connectMe').then(async () => { toast(T.hhConnectedToast); state.allStale = true; viewSettings(await call('settings')); })
      .catch((err) => { el.disabled = false; el.textContent = T.hhConnect; toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); });
  }
  if (a === 'pushtest') {
    el.disabled = true;
    return call('pushTest').then((r) => toast(T.notifSent(r.sent))).catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' })).finally(() => { el.disabled = false; });
  }
  if (a === 'pushforget') return call('pushForget').then(async () => { toast(T.notifForgotten); viewSettings(await call('settings')); }).catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }));
  if (a === 'spt') return openSpt(Number(el.dataset.year));
  if (a === 'sptcsv') return sptCsv();
  if (a === 'scanyearly') {
    el.disabled = true;
    el.textContent = T.yearlyScanning;
    return call('scanYearly').then((r) => { toast(T.yearlyFound(r.found)); state.dashByMonth = {}; closeModal(); if (state.tab === 'dashboard') viewDashboard(); })
      .catch((err) => { el.disabled = false; el.textContent = T.yearlyScan; toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); });
  }
  if (a === 'addasset' || a === 'delasset') {
    state.settings.assets = readAssets(el.closest('form'));
    if (a === 'addasset') state.settings.assets.push({ name: '', kind: 'other', qty: 1, unit_value: '', ticker: '', paid: '', warranty: '' });
    else state.settings.assets.splice(Number(el.dataset.i), 1);
    viewSettings(state.settings);
    if (a === 'addasset') { const n = $$('.asset-row [data-a2=name]'); if (n.length) n[n.length - 1].focus(); }
    return null;
  }
  if (a === 'reportmode') { state.reportYearly = el.dataset.mode === 'year'; return viewDashboard(); }
  if (a === 'yearmonth') { state.month = el.dataset.month; state.reportYearly = false; return show('dashboard'); }
  if (a === 'exportcsv') {
    if (!state.all) { call('list', { limit: 1000000 }).then((r) => { setAll(r.rows); exportCsv(); }).catch((err) => toast(`${T.error}: ${err.message}`, { kind: 'bad' })); return null; }
    return exportCsv();
  }
  if (a === 'selectmode') { state.selecting = !state.selecting; state.picked = new Set(); return viewTransactions(); }
  if (a === 'pick') {
    const id = String(el.dataset.id);
    if (state.picked.has(id)) state.picked.delete(id); else state.picked.add(id);
    return showResults();
  }
  if (a === 'pickapply') { const cat = $('#pickCat').value; if (!cat) { $('#pickCat').focus(); return null; } return applyPicked(cat, ''); }
  if (a === 'pickignore') return applyPicked('', 'ignored');
  if (a === 'undoimport') {
    if (!window.confirm(T.importUndoConfirm)) return null;
    return call('undoImport', { batch: el.dataset.batch }).then(async () => {
      toast(T.importUndone);
      state.allStale = true; state.dashByMonth = {};
      viewSettings(await call('settings'));
      scheduleRefresh(0);
    }).catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }));
  }
  if (a === 'hide') {
    state.hide = !state.hide;
    try { window.localStorage.setItem(HIDE_KEY, state.hide ? '1' : '0'); } catch (err) { /* this visit only */ }
    updateHideBtn();
    toast(state.hide ? T.amountsHidden : T.amountsShown);
    return show(state.tab);
  }
  if (a === 'drillday') {
    state.filters = { q: '', month: '', from: el.dataset.date, to: el.dataset.date, stream: '', category: '', status: '', direction: '' };
    state.limit = 50;
    return show('transactions');
  }
  if (a === 'edit') return openEditor(el.dataset.id);
  if (a === 'splitopen') return openSplit(el.dataset.id);
  if (a === 'splitsummary') { openEditor(el.dataset.id); return openSplit(el.dataset.id); }
  if (a === 'splitcancel') { $('#splitBox').innerHTML = splitSummary(state.rowsById.get(String(el.dataset.id))); return null; }
  if (a === 'splitadd') {
    const box = $('#splitRows');
    const x = state.rowsById.get(String(el.closest('form').dataset.id));
    box.insertAdjacentHTML('beforeend', splitRow({ direction: x.direction }, box.children.length));
    updateSplitLeft();
    return null;
  }
  if (a === 'unsplit') { if (!window.confirm(T.splitUndoConfirm)) return null; return unsplit(el.dataset.id); }
  if (a === 'addrule') {
    state.settings.rules = readRules($('form[data-form=rules]'));
    state.settings.rules.push({ id: '', field: 'description', pattern: '', category: '', auto_approve: true, hits: 0 });
    viewSettings(state.settings);
    const inputs = $$('.rule [data-r=pattern]');
    if (inputs.length) inputs[inputs.length - 1].focus();
    return null;
  }
  if (a === 'sendsummary') return sendSummaryNow(el);
  if (a === 'addgoal' || a === 'delgoal') {
    const form = el.closest('form');
    state.settings.goals = readGoals(form);
    if (a === 'addgoal') state.settings.goals.push({ stream: '', name: '', target: '', target_date: '' });
    else state.settings.goals.splice(Number(el.dataset.i), 1);
    viewSettings(state.settings);
    if (a === 'addgoal') { const sel = $$('.goal-row [data-g=stream]'); if (sel.length) sel[sel.length - 1].focus(); }
    return null;
  }
  if (a === 'dupcancel') { $('#addDup').innerHTML = ''; return null; }
  if (a === 'dupsave') { state.addForce = true; return submitAdd(el.closest('form')); }
  if (a === 'close') return closeModal();
  if (a === 'sync') return syncNow(el);
  if (a === 'theme') return toggleTheme();
  if (a === 'tour') { closeModal(); return tourStep(0); }
  if (a === 'tourstep') return tourStep(Number(el.dataset.i));
  if (a === 'install') return installApp();
  if (a === 'notifications') return openNotifications();
  if (a === 'notifgo') return goNotification(el);
  if (a === 'approve') return approve(card);
  if (a === 'salarysave') return saveSalary(card);
  if (a === 'salaryskip') return skipSalary(card);
  if (a === 'hiderec') return hideRecurring(el.dataset.name);
  if (a === 'fillbudgets') return fillBudgets(el.closest('form'));
  if (a === 'ignore') return ignore(card);
  if (a === 'applyrules') { el.disabled = true; return call('applyRules').then((r) => { toast(T.rulesApplied(r.changed)); return refresh(); }).catch((err) => { el.disabled = false; toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); }); }
  if (a === 'convtopups') { el.disabled = true; return call('convertTopups', { wallet: el.dataset.wallet }).then((r) => { toast(T.attnTopupsDone(r.converted)); state.allStale = true; return refresh(); }).catch((err) => { el.disabled = false; toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); }); }
  if (a === 'linktx') { el.disabled = true; return call('linkTransfer', { id: el.dataset.id, withId: el.dataset.with }).then(() => { toast(T.attnLinked); return refresh(); }).catch((err) => { el.disabled = false; toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); }); }
  if (a === 'dismissmail') { el.disabled = true; return call('dismissEmail', { gmailId: el.dataset.id }).then(() => { toast(T.mailDismissed); return refresh(); }).catch((err) => { el.disabled = false; toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); }); }
  if (a === 'delete') {
    if (!window.confirm(T.confirmDelete)) return null;
    const id = el.dataset.id;
    const row = state.rowsById.get(String(id));
    closeModal();
    if (row && row.gmail_id) patchRow(id, { status: 'ignored' });
    else {
      if (state.all) state.all = state.all.filter((r) => String(r.id) !== String(id));
      if (state.review) state.review.recentAuto = state.review.recentAuto.filter((r) => String(r.id) !== String(id));
      state.dashByMonth = {};
    }
    repaint();
    toast(row && row.gmail_id ? T.ignoredInstead : T.deleted);
    return save('remove', { id }).catch((err) => { toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); scheduleRefresh(0); });
  }
  if (a === 'delrule') { state.settings.rules = readRules(el.closest('form')); state.settings.rules.splice(Number(el.dataset.i), 1); return viewSettings(state.settings); }
  if (a === 'newaccount') {
    state.prefillAccount = { institution: el.dataset.inst, match_hint: el.dataset.hint };
    state.settingsSection = 'accounts';
    return show('settings');
  }
  if (a === 'budgetscope') {
    // What was typed for this view is kept, then the other view's fields show (nothing is saved until "Simpan budget").
    state.settings.budgets = mergeBudgetForm(el.closest('form'));
    state.budgetScope = el.dataset.scope;
    return viewSettings(state.settings);
  }
  if (a === 'delacct') {
    // Taken off the list here; it is gone when the list is saved (an account with transactions is refused there, with the reason).
    state.settings.accounts = readAccounts(el.closest('form'));
    state.settings.accounts.splice(Number(el.dataset.i), 1);
    return viewSettings(state.settings);
  }
  if (a === 'addacct') {
    const form = el.closest('form');
    state.settings.accounts = readAccounts(form);
    state.settings.accounts.push({ stream: '', type: 'Spending', institution: '', match_hint: '', opening_balance: 0 });
    viewSettings(state.settings);
    const rows = $$('.acct [data-a=stream]');
    if (rows.length) rows[rows.length - 1].focus();
    return null;
  }
  return null;
}

export function onSubmit(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return null;
  e.preventDefault();
  const kind = form.dataset.form;
  const d = Object.fromEntries(new FormData(form).entries());
  if (kind === 'add') return submitAdd(form);
  if (kind === 'split') return submitSplit(form);
  if (kind === 'edit') {
    const amount = amountValue(d.amount);
    if (!fieldMessage(form.querySelector('[name=amount]'), amount > 0 ? '' : T.errAmount)) return null;
    const id = form.dataset.id;
    const before = { ...state.rowsById.get(String(id)) };
    const fields = { ...d, amount };
    closeModal();
    patchRow(id, fields);
    updateNav();
    repaint();
    toast(T.saved);
    return save('update', { id, fields }).catch((err) => {
      patchRow(id, before); updateNav(); repaint();
      toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' });
    });
  }
  if (kind === 'config') {
    applyTheme(d.theme);
    return saveForm(form, 'saveConfig', d, async () => { applyLanguage(d.language); state.month = ''; state.dashByMonth = {}; await refresh(); if (state.tab === 'settings') viewSettings(); });
  }
  if (kind === 'tagbudget') {
    const tag = form.querySelector('[name=tag]').value.replace(/^#/, '').trim();
    const amount = amountValue(form.querySelector('[name=amount]').value || '0');
    let ok = fieldMessage(form.querySelector('[name=tag]'), /^[\p{L}\p{N}_-]+$/u.test(tag) ? '' : T.errTag);
    ok = fieldMessage(form.querySelector('[name=amount]'), amount >= 0 ? '' : T.errAmount) && ok;
    if (!ok) return null;
    return saveForm(form, 'setTagBudget', { tag, amount: amount || 0 }, () => { closeModal(); state.dashByMonth = {}; if (state.tab === 'dashboard') viewDashboard(); });
  }
  if (kind === 'tagih') {
    const names = form.querySelector('[name=who]').value.split(',').map((n) => n.trim()).filter(Boolean);
    const each = amountValue(form.querySelector('[name=each]').value);
    let ok = fieldMessage(form.querySelector('[name=who]'), names.length ? '' : T.errTagihWho);
    ok = fieldMessage(form.querySelector('[name=each]'), each > 0 ? '' : T.errAmount) && ok;
    if (!ok) return null;
    return saveForm(form, 'tagih', { txId: form.dataset.id, people: names.map((who) => ({ who, amount: each })) }, () => {
      state.dashByMonth = {};
      form.querySelector('.state').textContent = `✓ ${T.tagihDone(names.length, rp(each * names.length))}`;
      form.querySelector('button[type=submit]').disabled = true;
    });
  }
  if (kind === 'plans') {
    const plans = readPlans(form).map((x) => ({ ...x, amount: amountValue(x.amount), day: Number(x.day) }));
    return saveForm(form, 'savePlans', { plans }, async () => { viewSettings(await call('settings')); });
  }
  if (kind === 'household') {
    const v = (n) => form.querySelector(`[name=${n}]`).value.trim();
    const emailsOf = (n) => v(n).toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
    const valid = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
    let ok = true;
    for (const role of ['owner', 'partner']) {
      ok = fieldMessage(form.querySelector(`[name=${role}_emails]`), emailsOf(`${role}_emails`).every(valid) ? '' : T.hhErrEmail) && ok;
    }
    ok = fieldMessage(form.querySelector('[name=owner_name]'), v('owner_name') ? '' : T.hhErrName) && ok;
    ok = fieldMessage(form.querySelector('[name=partner_name]'), !emailsOf('partner_emails').length || v('partner_name') ? '' : T.hhErrName) && ok;
    const splitInput = form.querySelector('[name=split]');
    if (splitInput) ok = fieldMessage(splitInput, Number(splitInput.value) >= 1 && Number(splitInput.value) <= 99 ? '' : T.hhErrSplit) && ok;
    if (!ok) return null;
    const person = (role) => ({ name: v(`${role}_name`), emails: emailsOf(`${role}_emails`), bankNames: v(`${role}_bank`) });
    return saveForm(form, 'saveHousehold', { owner: person('owner'), partner: person('partner'), ...(splitInput ? { split: Number(splitInput.value) } : {}) }, async () => { state.dashByMonth = {}; state.allStale = true; await refresh(); viewSettings(await call('settings')); });
  }
  if (kind === 'restore') {
    const rows = state.restoreRows || [];
    if (!rows.length) return null;
    const btn = form.querySelector('button[type=submit]');
    const st = form.querySelector('.state');
    btn.disabled = true;
    st.className = 'state';
    st.textContent = T.saving;
    (async () => {
      try {
        let added = 0;
        for (let i = 0; i < rows.length; i += 1000) added += (await call('restoreBackup', { rows: rows.slice(i, i + 1000) })).added;
        state.restoreRows = null;
        state.allStale = true;
        state.dashByMonth = {};
        $('#restoreReview').innerHTML = '';
        st.className = 'state ok';
        st.textContent = `✓ ${T.restoreDone(added)}`;
        await refresh();
      } catch (err) {
        st.className = 'state bad';
        st.textContent = err.message;
        btn.disabled = false;
      }
    })();
    return null;
  }
  if (kind === 'telegramtoken') {
    const token = form.querySelector('[name=token]').value.trim();
    if (!fieldMessage(form.querySelector('[name=token]'), validToken(token) ? '' : T.tgBad)) return null;
    return saveForm(form, 'saveTelegramToken', { token }, async () => { viewSettings(await call('settings')); });
  }
  if (kind === 'notif') {
    const events = NOTIF_EVENTS.filter((k) => form.querySelector(`[name=push_${k}]`).checked);
    return saveForm(form, 'saveConfig', { push_events: events });
  }
  if (kind === 'cards') {
    const cards = readCards(form).map((c) => ({ stream: c.stream, statement: Number(c.statement), due: Number(c.due) }));
    return saveForm(form, 'saveCards', { cards }, async () => { state.dashByMonth = {}; viewSettings(await call('settings')); });
  }
  if (kind === 'assets') {
    const assets = readAssets(form).map((x) => ({ ...x, unit_value: amountValue(x.unit_value) || 0, paid: amountValue(x.paid) || '', qty: x.qty === '' ? 1 : Number(x.qty) }));
    return saveForm(form, 'saveAssets', { assets }, async () => { state.dashByMonth = {}; viewSettings(await call('settings')); });
  }
  if (kind === 'import') {
    const rows = importChosen(form);
    if (!rows.length || !state.importRows) return null;
    const imp = state.importRows;
    return saveForm(form, 'importStatement', { stream: imp.stream, rows, file: imp.file }, async (r) => {
      state.importRows = null;
      state.allStale = true; state.dashByMonth = {};
      const fresh = await call('settings');
      if (state.tab === 'settings' && state.settingsSection === 'import') {
        viewSettings(fresh);
        const st = $('form[data-form=import] .state');
        if (st) { st.className = 'state ok'; st.textContent = `✓ ${T.importSaved(r.added, r.pending)}${r.openingChange ? ` ${T.importOpening(imp.stream, rp(r.openingChange))}` : ''}`; }
      }
      scheduleRefresh(0);
    });
  }
  if (kind === 'monthend') {
    const items = $$('.bal-row', form).filter((row) => $('[data-k=actual]', row).value !== '').map((row) => {
      const how = $('.bal-how', row);
      const opening = $('[data-k=as_opening]', row);
      return { stream: row.dataset.stream, actual: Number($('[data-k=actual]', row).value), asOpening: !!(opening && opening.checked), category: how.hidden ? '' : $('[data-k=category]', how).value };
    });
    const st = form.querySelector('.state');
    if (!items.length) { st.className = 'state bad'; st.textContent = T.errNoBalances; const first = $('[data-k=actual]', form); if (first) first.focus(); return null; }
    return saveForm(form, 'balanceCheckAll', { date: d.date, items }, async (r) => {
      const lines = r.results.map((x) => (x.opening != null ? T.balOpening(x.stream, rp(x.opening))
        : x.adjusted ? T.balAdjusted(x.stream, `${x.adjusted > 0 ? '+' : '−'}${rp(Math.abs(x.adjusted))}`, x.category) : T.balMatched(x.stream)));
      state.allStale = true;
      state.dashByMonth = {};
      // Fresh balances and "last checked" dates on the form, with the result kept underneath.
      const fresh = await call('settings');
      if (state.tab === 'settings' && (state.settingsSection || 'monthend') === 'monthend') {
        viewSettings(fresh);
        const st2 = $('form[data-form=monthend] .state');
        if (st2) { st2.className = 'state ok'; st2.textContent = `✓ ${lines.join(' · ')}`; }
      }
      scheduleRefresh(0);
    });
  }
  if (kind === 'accounts') {
    const list = storedOrder(readAccounts(form).filter((a) => a.stream.trim())); // the stored order, not the order shown
    return saveForm(form, 'saveAccounts', { accounts: list }, (r) => { if (r && r.adopted) { toast(T.adopted(r.adopted)); state.allStale = true; state.dashByMonth = {}; } return refresh(); });
  }
  if (kind === 'categories') {
    const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const next = { income: lines(d.income), expense: lines(d.expense) };
    // Say which names count as renames (their transactions follow) before anything changes.
    let renames = [];
    try {
      const was = state.settings.categories;
      renames = Object.entries(renamedCategories(buildCategorySlots({ income: was.income, expense: was.expense }), buildCategorySlots(next)));
    } catch (err) {
      const st = form.querySelector('.state');
      st.className = 'state bad'; st.textContent = err.message;
      return null;
    }
    if (renames.length && !window.confirm(T.confirmRenames(renames.map(([a, b]) => `${a} → ${b}`).join('\n')))) return null;
    return saveForm(form, 'saveCategories', next, (r) => {
      const done = Object.entries(r.renamed || {});
      if (done.length) form.querySelector('.state').textContent = `✓ ${T.renamedDone(done.map(([a, b]) => `${a} → ${b}`).join(', '))}`;
      state.settings.categories = { ...state.settings.categories, ...next };
      state.allStale = true;
      return refresh();
    });
  }
  if (kind === 'budgets') {
    const budgets = mergeBudgetForm(form);
    return saveForm(form, 'saveBudgets', { budgets }, () => { state.dashByMonth = {}; });
  }
  if (kind === 'rules') {
    const rules = readRules(form);
    let ok = true;
    $$('.rule', form).forEach((el, i) => {
      const c = compileRule(rules[i]);
      ok = fieldMessage($('[data-r=pattern]', el), !rules[i].pattern ? T.errRulePattern : c.re ? '' : T.errRuleInvalid) && ok;
      ok = fieldMessage($('[data-r=category]', el), rules[i].category ? '' : T.errNoCategory) && ok;
    });
    if (!ok) return null;
    return saveForm(form, 'saveRules', { rules }, () => { state.settings.rules = rules; });
  }
  if (kind === 'goals') {
    const goals = readGoals(form).map((g) => ({ ...g, target: Number(g.target) || 0 }));
    let ok = true;
    $$('.goal-row', form).forEach((row, i) => {
      ok = fieldMessage($('[data-g=stream]', row), goals[i].stream ? '' : T.errNoAccount) && ok;
      ok = fieldMessage($('[data-g=target]', row), goals[i].target > 0 ? '' : T.errAmount) && ok;
    });
    if (!ok) return null;
    return saveForm(form, 'saveGoals', { goals }, () => { state.settings.goals = goals; state.dashByMonth = {}; });
  }
  if (kind === 'weekly') {
    const v = (n) => (form.querySelector(`[name=${n}]`).checked ? 'on' : 'off');
    return saveForm(form, 'saveConfig', { weekly_email: v('weekly_email'), monthly_email: v('monthly_email'), payday_email: v('payday_email'), bill_email: v('bill_email'), close_email: v('close_email'), calendar_sync: v('calendar_sync') }, (r) => {
      if (r && r.calendar) form.querySelector('.state').textContent = r.calendar.error ? T.calendarFailed : `✓ ${T.calendarDone(r.calendar.events)}`;
    });
  }
  return null;
}

export function onChange(e) {
  if (e.target.dataset.k === 'as_opening') { updateBalRow(e.target.closest('.bal-row')); return null; }
  if (e.target.name === 'me' && e.target.closest('form[data-form=tagih]')) { updateTagih(e.target.closest('form')); return null; }
  if (e.target.dataset.p === 'direction') { const f = e.target.closest('form'); state.settings.plans = readPlans(f); viewSettings(state.settings); return null; }
  const resForm = e.target.closest('form[data-form=restore]');
  if (resForm && e.target.name === 'backup') { readBackup(resForm); return null; }
  const impForm = e.target.closest('form[data-form=import]');
  if (impForm && (e.target.name === 'statement' || e.target.name === 'stream')) { readStatement(impForm); return null; }
  if (impForm && e.target.dataset.imp) {
    const n = importChosen(impForm).length;
    const btn = impForm.querySelector('button[type=submit]');
    btn.textContent = T.importSave(n); btn.disabled = !n;
    return null;
  }
  if ((e.target.name === 'accent' || e.target.name === 'size') && e.target.closest('form[data-form=config]')) { saveLook({ [e.target.name]: e.target.value }); applyLook(); return null; }
  if (e.target.name === 'theme' && e.target.closest('form[data-form=config]')) { applyTheme(e.target.value); return null; }
  const f = e.target.closest('[data-filter]');
  if (f) {
    state.filters[f.dataset.filter] = f.value;
    if (f.dataset.filter === 'month') { state.filters.from = ''; state.filters.to = ''; }
    state.limit = 50;
    return showResults();
  }
  // A changed category clears its "choose a category" message.
  if (e.target.closest('.field.invalid') && e.target.value) fieldMessage(e.target, '');
  if (e.target.name === 'direction' && e.target.closest('form[data-form=edit]')) {
    const cat = e.target.form.querySelector('[name=category]');
    cat.innerHTML = categoryOptions(cat.value, e.target.value);
  }
  return null;
}
