/* دفتر المقاصف — staff & admin web app (no build step, no libraries) */
(function () {
'use strict';

const CFG = window.APP_CONFIG || {};

// ---------------------------------------------------------------- constants
const TASKS = [
  { group: 'الفتح الصباحي', items: [
    ['o1', 'تنظيف وتعقيم الكاونتر وأسطح التحضير'],
    ['o2', 'فحص تواريخ الصلاحية وإبعاد أي منتج منتهي'],
    ['o3', 'التأكد أن حرارة الثلاجة أقل من 5° م'],
    ['o4', 'تجهيز الصندوق والفكّة'],
    ['o5', 'تشغيل جهاز مدى والتأكد من الاتصال'],
    ['o6', 'لبس المريلة وغطاء الشعر والقفازات']] },
  { group: 'قبل الفسحة', items: [
    ['r1', 'تجهيز الساندويتشات والوجبات'],
    ['r2', 'ترتيب العرض ووضع الأسعار بشكل واضح'],
    ['r3', 'تجهيز المشروبات وآلة القهوة (للكوفي)']] },
  { group: 'الإغلاق', items: [
    ['c1', 'جرد المتبقي وتسجيله في قسم الجرد'],
    ['c2', 'عدّ الصندوق وتسليم الكاش'],
    ['c3', 'تنظيف الأجهزة والأرضية'],
    ['c4', 'إحكام إغلاق الثلاجات وإطفاء باقي الأجهزة'],
    ['c5', 'إرسال طلبية الفرع'],
    ['c6', 'إخراج النفايات']] }
];
const TASK_COUNT = TASKS.reduce((n, g) => n + g.items.length, 0);
const STAFF_TABS = [['home', 'الرئيسية'], ['checklist', 'مهام اليوم'], ['report', 'تقرير الإغلاق'], ['order', 'الطلبية'], ['stock', 'الجرد']];
const ADMIN_TABS = [['overview', 'اليوم'], ['aorders', 'الطلبيات'], ['astock', 'الجرد'], ['period', 'تقرير فترة'], ['settings', 'الإعدادات']];
const KIND_LABEL = { all: 'المقاصف والكوفيهات', canteen: 'المقاصف فقط', cafe: 'الكوفيهات فقط' };
const NO_CAT = 'أصناف أخرى';
const MSG = {
  NETWORK: 'ما فيه اتصال بالإنترنت، حاول مرة ثانية',
  SESSION_EXPIRED: 'انتهت الجلسة، سجّل دخول من جديد',
  DAY_LOCKED: 'ما يمكن تعديل يوم أقدم من 3 أيام، كلّمي الإدارة',
  BAD_DAY: 'التاريخ غير صحيح',
  NOT_ADMIN: 'هذا للإدارة فقط',
  BAD_PIN_FORMAT: 'الرقم السري لازم يكون من 4 إلى 8 أرقام',
  BAD_INPUT: 'تأكد من البيانات المكتوبة',
  BAD_RANGE: 'الفترة لازم تكون أقل من 3 شهور',
  BAD_PIN: 'الرقم السري غلط',
  LOCKED: 'محاولات غلط كثيرة. انتظر 15 دقيقة وحاول مرة ثانية',
  NO_PIN: 'هذا الفرع ما له رقم سري بعد، اطلبيه من الإدارة',
  DUPLICATE: 'فيه صنف ثاني بنفس الاسم',
  NOT_FOUND: 'الصنف غير موجود، حدّث الصفحة'
};

// ---------------------------------------------------------------- helpers
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });
const money = v => nf.format(Number(v) || 0);
const westDigits = s => String(s == null ? '' : s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const num = v => { const n = parseFloat(westDigits(v).replace(/[٫,]/g, '.')); return isFinite(n) && n >= 0 ? n : 0; };
const qtyOrNull = v => { const s = westDigits(v).replace(/[٫,]/g, '.').trim(); if (s === '') return null; const n = parseFloat(s); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
const digits = v => westDigits(v).replace(/\D/g, '');
const norm = s => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْـ]/g, '').trim();
const riyadhDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const toDate = iso => new Date(iso + 'T12:00:00Z');
const addDays = (iso, n) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dateLabel = (iso, opts) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', opts || { weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(iso));
const shortDate = iso => dateLabel(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const timeLabel = iso => { try { return new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; } };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
};
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
function notice(t) { $('notice').textContent = t || ''; $('notice').hidden = !t; }
const errMsg = e => MSG[e && e.code] || 'صار خطأ، حاول مرة ثانية';
const pill = (cls, text) => `<span class="pill ${cls}">${esc(text)}</span>`;
function downloadCSV(name, rows) {
  const csv = '﻿' + rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name + '.csv';
  a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------------------------------------------------------------- api
async function api(fn, args) {
  const key = CFG.SUPABASE_KEY;
  const headers = { 'Content-Type': 'application/json', apikey: key };
  if (/^eyJ/.test(key)) headers.Authorization = 'Bearer ' + key; // legacy anon JWT
  let res;
  try {
    res = await fetch(CFG.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers, body: JSON.stringify(args || {}) });
  } catch (e) { throw { code: 'NETWORK' }; }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) {
    const code = (data && data.message) || ('HTTP_' + res.status);
    if (code === 'SESSION_EXPIRED') { endSession(); toast(MSG.SESSION_EXPIRED); }
    throw { code };
  }
  return data;
}

// ---------------------------------------------------------------- state
const S = { sess: null, branches: [], today: riyadhDate(), date: riyadhDate(), view: null, data: null, period: null, aoView: 'total' };
try { S.sess = JSON.parse(store.get('sess') || 'null'); } catch (e) { S.sess = null; }
const tok = () => S.sess && S.sess.token;
const isAdmin = () => !!(S.sess && S.sess.is_admin);
const branchName = id => (S.branches.find(b => b.id === id) || {}).name || id;
const shortBranch = b => b.name.replace(/^(مقصف|كوفي)\s+/, '');
const products = () => (S.data && S.data.products) || [];
function prodMap() { const m = {}; products().forEach(p => { m[p.id] = p; }); return m; }
function groupByCat(list) {
  const groups = [], idx = {};
  list.forEach(p => { const c = p.category || NO_CAT; if (!(c in idx)) { idx[c] = groups.length; groups.push({ cat: c, items: [] }); } groups[idx[c]].items.push(p); });
  return groups;
}

function show(screen) { ['login', 'setup', 'app'].forEach(id => { $(id).hidden = id !== screen; }); }

// ---------------------------------------------------------------- login
async function loadStatus() {
  const st = await api('app_status');
  S.branches = st.branches || []; S.today = st.today || S.today;
  return st;
}
async function showLogin() {
  show('login');
  $('l-error').hidden = true;
  $('l-staff').value = store.get('staff') || '';
  try {
    await loadStatus();
    const opt = b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`;
    $('l-branch').innerHTML =
      '<option value="" disabled selected>اختاري الفرع</option>' +
      '<optgroup label="المقاصف">' + S.branches.filter(b => b.kind === 'canteen').map(opt).join('') + '</optgroup>' +
      '<optgroup label="الكوفيهات">' + S.branches.filter(b => b.kind === 'cafe').map(opt).join('') + '</optgroup>' +
      '<optgroup label="الإدارة"><option value="admin">الإدارة</option></optgroup>';
    const last = store.get('lastBranch');
    if (last && [...$('l-branch').options].some(o => o.value === last)) $('l-branch').value = last;
    syncLoginFields();
  } catch (e) { loginError(e.code === 'NETWORK' ? MSG.NETWORK : 'ما قدرنا نوصل لقاعدة البيانات. تأكد من إعدادات config.js'); }
}
function syncLoginFields() { $('l-staff-wrap').hidden = $('l-branch').value === 'admin'; }
function loginError(t) { $('l-error').textContent = t; $('l-error').hidden = !t; }
$('l-branch').addEventListener('change', syncLoginFields);
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const branch = $('l-branch').value, pin = digits($('l-pin').value), staff = $('l-staff').value.trim();
  if (!branch) return loginError('اختاري الفرع');
  if (branch !== 'admin' && !staff) return loginError('اكتبي اسمك');
  if (!pin) return loginError('اكتب الرقم السري');
  $('l-btn').disabled = true; loginError('');
  try {
    const r = await api('app_login', { p_branch: branch, p_pin: pin, p_staff: branch === 'admin' ? null : staff });
    if (!r || !r.ok) { loginError(MSG[r && r.error] || 'ما قدرنا نسجّل الدخول'); return; }
    store.set('lastBranch', branch); if (staff) store.set('staff', staff);
    S.sess = { token: r.token, is_admin: r.is_admin, branch: r.branch, name: r.name };
    store.set('sess', JSON.stringify(S.sess));
    $('l-pin').value = '';
    startApp();
  } catch (err) { loginError(errMsg(err)); }
  finally { $('l-btn').disabled = false; }
});

function endSession() { S.sess = null; S.data = null; store.set('sess', null); showLogin(); }
$('logoutBtn').addEventListener('click', async () => {
  if (anyDirty() && !$('logoutBtn').dataset.sure) {
    $('logoutBtn').dataset.sure = '1'; $('logoutBtn').textContent = 'فيه شي ما انرسل، خروج؟';
    setTimeout(() => { delete $('logoutBtn').dataset.sure; $('logoutBtn').textContent = 'خروج'; }, 4000);
    return;
  }
  const t = tok(); endSession();
  if (t) { try { await api('app_logout', { p_token: t }); } catch (e) {} }
});

// ---------------------------------------------------------------- app shell
async function startApp() {
  show('app');
  notice('');
  const tabs = isAdmin() ? ADMIN_TABS : STAFF_TABS;
  $('tabs').innerHTML = tabs.map(([v, l]) => `<button class="tab" role="tab" type="button" data-view="${v}">${l}</button>`).join('');
  $('whoName').textContent = S.sess.name || 'دفتر المقاصف';
  $('whoSub').textContent = isAdmin() ? 'متابعة كل الفروع' : (store.get('staff') || '');
  S.date = S.today = riyadhDate();
  $('date').value = S.date;
  go(tabs[0][0]);
  if (!S.branches.length) { try { await loadStatus(); } catch (e) {} }
  await load();
}
$('tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) go(t.dataset.view); });
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
document.querySelectorAll('[data-print]').forEach(b => b.addEventListener('click', () => window.print()));
function go(v) {
  S.view = v;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === v)));
  document.querySelectorAll('main > .view').forEach(s => { s.hidden = s.id !== 'v-' + v; });
  $('pickers').hidden = v === 'period' || v === 'settings';
  if (v === 'period' && !S.period) setPreset('week');
  if (v === 'settings') { renderPins(); renderProducts(); }
  window.scrollTo({ top: 0 });
}
$('date').addEventListener('change', () => {
  const v = $('date').value; if (!v) return;
  S.date = v; formDirty = false; pending = null; load();
});
function updateDateBounds() {
  $('date').max = S.today;
  $('date').min = isAdmin() ? '' : addDays(S.today, -3);
  $('dateLabel').textContent = S.date === S.today ? 'اليوم · ' + dateLabel(S.date) : dateLabel(S.date);
}

let loading = false;
async function load(silent) {
  if (!tok() || loading) return;
  loading = true;
  try {
    const d = await api('app_day', { p_token: tok(), p_day: S.date });
    S.data = d; if (d.today) S.today = d.today;
    if (!isAdmin() && d.staff) store.set('staff', d.staff);
    notice('');
    renderAll();
  } catch (e) {
    if (e.code !== 'SESSION_EXPIRED' && !silent) notice(errMsg(e));
  } finally { loading = false; }
}
function anyDirty() { return formDirty || boardDirty || !!pending || SH.order.dirty || SH.stock.dirty; }
function busyEditing() {
  const a = document.activeElement;
  return anyDirty() || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('app').contains(a));
}
setInterval(() => { if (document.visibilityState === 'visible' && tok() && !busyEditing()) load(true); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && tok() && !busyEditing()) load(true); });
window.addEventListener('beforeunload', e => { if (tok() && (SH.order.dirty || SH.stock.dirty || formDirty)) { e.preventDefault(); e.returnValue = ''; } });

function renderAll() {
  updateDateBounds();
  if (isAdmin()) { renderOverview(); renderAOrders(); renderAStock(); if (S.view === 'settings') renderProducts(); }
  else { renderHome(); renderChecklist(); renderReport(); syncSheet('order'); syncSheet('stock'); }
}

// ---------------------------------------------------------------- staff: home
function renderHome() {
  const d = S.data || {};
  $('homeTitle').textContent = (S.sess.name || '') + ' · ' + dateLabel(S.date);
  const b = d.board && d.board.body; $('boardBox').hidden = !b; $('boardText').textContent = b || '';
  const n = d.checklist ? d.checklist.done_count : 0;
  const sc = $('stCheck'); sc.className = 'pill num ' + (n >= TASK_COUNT ? 'ok' : n ? 'warn' : 'idle'); sc.textContent = `${n}/${TASK_COUNT}`;
  const r = d.report; const sr = $('stReport'); sr.className = 'pill ' + (r ? 'ok' : 'idle'); sr.textContent = r ? money(num(r.cash) + num(r.card)) + ' ر.س' : 'لم يُرسل';
  const o = d.order, so = $('stOrder');
  so.className = 'pill ' + (SH.order.dirty ? 'warn' : o ? 'ok' : 'idle');
  so.textContent = SH.order.dirty ? 'ما انرسلت' : o ? `انرسلت · ${o.item_count} صنف` : 'لم تُرسل';
  const k = d.stock, sk = $('stStock');
  sk.className = 'pill ' + (SH.stock.dirty ? 'warn' : k ? 'ok' : 'idle');
  sk.textContent = SH.stock.dirty ? 'ما انحفظ' : k ? `تم · ${k.item_count} صنف` : 'لم يُسجل';
  if (document.activeElement !== $('staff')) $('staff').value = d.staff || store.get('staff') || '';
  $('whoSub').textContent = d.staff || store.get('staff') || '';
}
$('staffForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = $('staff').value.trim(); if (!v) { toast('اكتبي اسمك'); return; }
  try { await api('app_set_staff', { p_token: tok(), p_staff: v }); store.set('staff', v); toast('انحفظ الاسم'); await load(true); }
  catch (err) { toast(errMsg(err)); }
});

// ---------------------------------------------------------------- staff: checklist
let pending = null, checkTimer = null;
function renderChecklist() {
  const c = (S.data && S.data.checklist) || {};
  const done = pending ? pending : (c.done || {});
  let n = 0;
  $('checkGroups').innerHTML = TASKS.map(g => {
    const k = g.items.filter(i => done[i[0]]).length; n += k;
    return `<div class="check-group"><h3><span>${esc(g.group)}</span><span class="num">${k}/${g.items.length}</span></h3>` +
      g.items.map(([id, txt]) => `<label class="check" for="t-${id}"><input type="checkbox" id="t-${id}" data-task="${id}" ${done[id] ? 'checked' : ''}><span>${esc(txt)}</span></label>`).join('') + '</div>';
  }).join('');
  setCheckProgress(n);
  $('checkMeta').textContent = c.updated_at ? `آخر تحديث ${timeLabel(c.updated_at)}${c.staff ? ' · ' + c.staff : ''}` : '';
}
function setCheckProgress(n) { $('checkPct').textContent = `${n} من ${TASK_COUNT}`; $('checkBar').style.width = (n / TASK_COUNT * 100) + '%'; }
$('checkGroups').addEventListener('change', e => {
  const id = e.target.dataset && e.target.dataset.task; if (!id) return;
  pending = Object.assign({}, pending || ((S.data && S.data.checklist && S.data.checklist.done) || {}));
  pending[id] = e.target.checked;
  setCheckProgress(Object.values(pending).filter(Boolean).length);
  clearTimeout(checkTimer);
  checkTimer = setTimeout(saveChecklist, 800);
});
async function saveChecklist() {
  const done = pending; if (!done) return;
  try {
    const c = await api('app_save_checklist', { p_token: tok(), p_day: S.date, p_done: done });
    if (pending === done) { pending = null; if (S.data) S.data.checklist = c; renderChecklist(); renderHome(); }
  } catch (err) { pending = null; toast(errMsg(err)); load(true); }
}

// ---------------------------------------------------------------- staff: report
let formDirty = false;
['r-cash', 'r-card', 'r-exp', 'r-waste', 'r-best', 'r-notes'].forEach(id => $(id).addEventListener('input', () => { formDirty = true; calcTotals(); }));
function calcTotals() {
  const c = num($('r-cash').value), k = num($('r-card').value), x = num($('r-exp').value);
  $('t-total').textContent = money(c + k); $('t-hand').textContent = money(c - x);
  $('t-cardpct').textContent = (c + k ? Math.round(k / (c + k) * 100) : 0) + '٪';
}
function renderReport() {
  const r = S.data && S.data.report;
  if (!formDirty) {
    const f = v => (r && Number(v)) ? String(Number(v)) : '';
    $('r-cash').value = f(r && r.cash); $('r-card').value = f(r && r.card);
    $('r-exp').value = f(r && r.expenses); $('r-waste').value = f(r && r.waste);
    $('r-best').value = (r && r.best) || ''; $('r-notes').value = (r && r.notes) || '';
  }
  calcTotals();
  const st = $('reportState'); st.className = 'pill ' + (r ? 'ok' : 'idle'); st.textContent = r ? 'تم الإرسال' : 'لم يُرسل';
  $('reportMeta').textContent = r ? `أُرسل ${timeLabel(r.updated_at)}${r.staff ? ' · ' + r.staff : ''}. تقدرين تعدّلينه وتحفظينه مرة ثانية.` : '';
  $('reportBtn').textContent = r ? 'تحديث التقرير' : 'حفظ التقرير';
}
$('reportForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!$('r-cash').value.trim() && !$('r-card').value.trim()) { toast('اكتبي مبيعات الكاش أو الشبكة'); return; }
  const p = { cash: num($('r-cash').value), card: num($('r-card').value), expenses: num($('r-exp').value), waste: num($('r-waste').value),
    best: $('r-best').value.trim(), notes: $('r-notes').value.trim(), staff: (S.data && S.data.staff) || store.get('staff') || '' };
  $('reportBtn').disabled = true;
  try {
    const r = await api('app_save_report', { p_token: tok(), p_day: S.date, p: p });
    formDirty = false; if (S.data) S.data.report = r; renderReport(); renderHome(); toast('انحفظ التقرير');
  } catch (err) { toast(errMsg(err)); }
  finally { $('reportBtn').disabled = false; }
});

// ---------------------------------------------------------------- staff: order & stock sheets
// order: blank = not needed, so 0 is removed. stock: blank = not counted yet, 0 = ran out.
const SH = {
  order: { vals: {}, extras: [], notes: '', dirty: false, view: 'all', key: null },
  stock: { vals: {}, dirty: false, view: 'all', key: null }
};
const docOf = mode => S.data && S.data[mode];
const hasVal = (mode, v) => mode === 'order' ? (v != null && v > 0) : v != null;
const sheetKey = () => (S.sess && S.sess.branch) + '|' + S.date;
const draftKey = (mode, key) => 'draft:' + mode + ':' + key;
const draftTimers = {};
function writeDraft(mode) {
  clearTimeout(draftTimers[mode]); draftTimers[mode] = null;
  const st = SH[mode];
  if (st.dirty && st.key) store.set(draftKey(mode, st.key), JSON.stringify({ vals: st.vals, extras: st.extras, notes: st.notes, at: Date.now() }));
}
function saveDraft(mode) { clearTimeout(draftTimers[mode]); draftTimers[mode] = setTimeout(() => writeDraft(mode), 300); }
// write pending drafts at once when the page is hidden or closed (phones kill background tabs)
const flushDrafts = () => { ['order', 'stock'].forEach(m => { if (draftTimers[m]) writeDraft(m); }); };
window.addEventListener('pagehide', flushDrafts);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDrafts(); });
function syncSheet(mode) {
  const st = SH[mode], key = sheetKey(), doc = docOf(mode);
  if (st.key === key && st.dirty) { renderSheetMeta(mode); return; }
  st.key = key; st.dirty = false;
  st.vals = {}; Object.entries((doc && doc.items) || {}).forEach(([k, v]) => { st.vals[k] = Number(v); });
  if (mode === 'order') { st.extras = ((doc && doc.extras) || []).map(x => ({ name: x.name || '', qty: x.qty || '' })); st.notes = (doc && doc.notes) || ''; }
  let draft = null; try { draft = JSON.parse(store.get(draftKey(mode, key)) || 'null'); } catch (e) {}
  if (draft && (!doc || draft.at > Date.parse(doc.updated_at))) {
    st.vals = draft.vals || {}; if (mode === 'order') { st.extras = draft.extras || []; st.notes = draft.notes || ''; }
    st.dirty = true;
  } else if (draft) store.set(draftKey(mode, key), null);
  renderSheet(mode);
}
function rowHTML(mode, p, v) {
  return `<div class="prow${hasVal(mode, v) ? ' has' : ''}" data-pid="${esc(p.id)}" data-name="${esc(norm(p.name + ' ' + (p.category || '')))}">
    <div class="pname"><span>${esc(p.name)}</span>${p.unit ? `<small>${esc(p.unit)}</small>` : ''}</div>
    <div class="stepper"><button type="button" data-step="-1" aria-label="إنقاص ${esc(p.name)}">−</button><input inputmode="decimal" autocomplete="off" aria-label="كمية ${esc(p.name)}" value="${v == null ? '' : esc(v)}"><button type="button" data-step="1" aria-label="زيادة ${esc(p.name)}">+</button></div></div>`;
}
function renderSheet(mode) {
  const st = SH[mode], list = $(mode + '-list'), prods = products();
  list.innerHTML = prods.length
    ? groupByCat(prods).map(g => `<div class="cat">${esc(g.cat)}</div>` + g.items.map(p => rowHTML(mode, p, st.vals[p.id])).join('')).join('')
    : `<div class="empty">ما فيه أصناف بعد. الإدارة تضيف الأصناف من الإعدادات.${mode === 'order' ? ' تقدرين الحين تكتبين طلبيتك في «أصناف مو موجودة في القائمة» تحت.' : ''}</div>`;
  if (mode === 'order') {
    renderExtras();
    if (document.activeElement !== $('order-notes')) $('order-notes').value = st.notes;
  }
  applyFilter(mode); renderSheetMeta(mode);
}
function applyFilter(mode) {
  const st = SH[mode], q = norm($(mode + '-q').value);
  const kids = [...$(mode + '-list').children];
  let cat = null, catVisible = false;
  const closeCat = () => { if (cat) cat.hidden = !catVisible; };
  kids.forEach(el => {
    if (el.classList.contains('cat')) { closeCat(); cat = el; catVisible = false; return; }
    if (!el.classList.contains('prow')) return;
    const has = hasVal(mode, st.vals[el.dataset.pid]);
    const ok = (!q || el.dataset.name.includes(q)) && (st.view === 'all' || (st.view === 'mine' ? has : !has));
    el.hidden = !ok; if (ok) catVisible = true;
  });
  closeCat();
}
function renderSheetMeta(mode) {
  const st = SH[mode], doc = docOf(mode);
  let n = Object.keys(st.vals).filter(k => hasVal(mode, st.vals[k])).length;
  if (mode === 'order') n += st.extras.filter(x => x.name.trim()).length;
  $(mode + '-count').textContent = n + ' صنف';
  $(mode + '-count').parentElement.classList.toggle('dirty', st.dirty);
  const state = $(mode + '-state');
  const done = mode === 'order' ? 'انرسلت' : 'تم الجرد', none = mode === 'order' ? 'لم تُرسل' : 'لم يُسجل';
  state.className = 'pill ' + (st.dirty ? 'warn' : doc ? 'ok' : 'idle');
  state.textContent = st.dirty ? 'مسودة' : doc ? done : none;
  $(mode + '-meta').textContent = doc ? `آخر حفظ ${timeLabel(doc.updated_at)}${doc.staff ? ' · ' + doc.staff : ''}. تقدرين تعدّلين وتحفظين مرة ثانية.` : '';
  $(mode + '-save').textContent = mode === 'order' ? (doc ? 'تحديث الطلبية' : 'إرسال الطلبية') : (doc ? 'تحديث الجرد' : 'حفظ الجرد');
  if (mode === 'order') {
    const prev = S.data && S.data.prev_order, btn = $('order-copy');
    const empty = n === 0;
    btn.hidden = !(prev && prev.item_count > 0 && empty);
    if (!btn.hidden) btn.textContent = `نسخ طلبية ${shortDate(prev.day)} (${prev.item_count} صنف) وتعديلها`;
  }
  if (!isAdmin()) renderHome();
}
function setVal(mode, pid, v) {
  const st = SH[mode];
  if (v == null || (mode === 'order' && v === 0)) delete st.vals[pid]; else st.vals[pid] = v;
  st.dirty = true;
  const row = $(mode + '-list').querySelector(`.prow[data-pid="${CSS.escape(pid)}"]`);
  if (row) row.classList.toggle('has', hasVal(mode, st.vals[pid]));
  renderSheetMeta(mode); saveDraft(mode);
}
['order', 'stock'].forEach(mode => {
  const list = $(mode + '-list');
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-step]'); if (!b) return;
    const row = b.closest('.prow'), input = row.querySelector('input'), pid = row.dataset.pid;
    const cur = qtyOrNull(input.value), step = Number(b.dataset.step);
    let next;
    if (mode === 'stock' && cur == null) next = step > 0 ? 1 : 0;
    else next = Math.max(0, (cur || 0) + step);
    if (mode === 'order' && next === 0) next = null;
    input.value = next == null ? '' : next;
    setVal(mode, pid, next);
  });
  list.addEventListener('input', e => {
    if (e.target.tagName !== 'INPUT') return;
    setVal(mode, e.target.closest('.prow').dataset.pid, qtyOrNull(e.target.value));
  });
  list.addEventListener('focusin', e => { if (e.target.tagName === 'INPUT') e.target.select(); });
  $(mode + '-q').addEventListener('input', () => applyFilter(mode));
  $(mode + '-save').addEventListener('click', () => saveSheet(mode));
});
document.querySelectorAll('[data-sf]').forEach(b => b.addEventListener('click', () => {
  const [mode, view] = b.dataset.sf.split(':');
  SH[mode].view = view;
  document.querySelectorAll(`[data-sf^="${mode}:"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  applyFilter(mode);
}));
// order extras (free-text rows)
function renderExtras() {
  $('order-extras').innerHTML = SH.order.extras.map((x, i) => `<div class="xrow" data-x="${i}">
      <input placeholder="اسم الصنف" aria-label="اسم الصنف" value="${esc(x.name)}" data-xf="name">
      <input placeholder="الكمية" aria-label="الكمية" value="${esc(x.qty)}" data-xf="qty">
      <button type="button" data-xdel aria-label="حذف السطر">×</button></div>`).join('');
}
$('order-addx').addEventListener('click', () => {
  SH.order.extras.push({ name: '', qty: '' }); renderExtras();
  const rows = $('order-extras').querySelectorAll('.xrow'); rows[rows.length - 1].querySelector('input').focus();
});
$('order-extras').addEventListener('input', e => {
  const row = e.target.closest('.xrow'); if (!row) return;
  SH.order.extras[Number(row.dataset.x)][e.target.dataset.xf] = e.target.value;
  SH.order.dirty = true; renderSheetMeta('order'); saveDraft('order');
});
$('order-extras').addEventListener('click', e => {
  if (!e.target.closest('[data-xdel]')) return;
  SH.order.extras.splice(Number(e.target.closest('.xrow').dataset.x), 1);
  SH.order.dirty = true; renderExtras(); renderSheetMeta('order'); saveDraft('order');
});
$('order-notes').addEventListener('input', () => { SH.order.notes = $('order-notes').value; SH.order.dirty = true; renderSheetMeta('order'); saveDraft('order'); });
$('order-copy').addEventListener('click', () => {
  const prev = S.data && S.data.prev_order; if (!prev) return;
  const ids = prodMap();
  SH.order.vals = {}; Object.entries(prev.items || {}).forEach(([k, v]) => { if (ids[k]) SH.order.vals[k] = Number(v); });
  SH.order.extras = (prev.extras || []).map(x => ({ name: x.name || '', qty: x.qty || '' }));
  SH.order.dirty = true; renderSheet('order'); saveDraft('order');
  toast('انسخت الطلبية، عدّلي اللي تبين وأرسليها');
});
async function saveSheet(mode) {
  const st = SH[mode], btn = $(mode + '-save');
  const items = {}; Object.entries(st.vals).forEach(([k, v]) => { if (hasVal(mode, v)) items[k] = v; });
  const extras = mode === 'order' ? st.extras.filter(x => x.name.trim()).map(x => ({ name: x.name.trim(), qty: String(x.qty || '').trim() })) : [];
  if (!Object.keys(items).length && !extras.length) { toast(mode === 'order' ? 'اكتبي كمية لصنف واحد على الأقل' : 'اكتبي المتبقي لصنف واحد على الأقل'); return; }
  btn.disabled = true;
  try {
    const doc = mode === 'order'
      ? await api('app_save_order', { p_token: tok(), p_day: S.date, p_items: items, p_extras: extras, p_notes: st.notes })
      : await api('app_save_stock', { p_token: tok(), p_day: S.date, p_items: items });
    if (S.data) S.data[mode] = doc;
    store.set(draftKey(mode, st.key), null);
    st.dirty = false; syncSheet(mode);
    toast(mode === 'order' ? 'انرسلت الطلبية للإدارة ✓' : 'انحفظ الجرد ✓');
  } catch (err) { toast(errMsg(err)); }
  finally { btn.disabled = false; }
}

// ---------------------------------------------------------------- admin: overview
function renderOverview() {
  const d = S.data || {};
  $('adminDate').textContent = dateLabel(S.date);
  const by = (arr) => { const m = {}; (arr || []).forEach(x => { m[x.branch_id] = x; }); return m; };
  const reps = by(d.reports), chk = by(d.checklists), ords = by(d.orders), stk = by(d.stocks);
  const f = { cash: 0, card: 0, exp: 0, waste: 0 }; let sent = 0;
  $('adminRows').innerHTML = S.branches.map(b => {
    const r = reps[b.id], c = chk[b.id], o = ords[b.id], k = stk[b.id], cnt = c ? c.done_count : 0;
    if (r) { sent++; f.cash += num(r.cash); f.card += num(r.card); f.exp += num(r.expenses); f.waste += num(r.waste); }
    return `<tr><td>${esc(b.name)}</td>` + (r
      ? `<td class="num">${money(r.cash)}</td><td class="num">${money(r.card)}</td><td class="num"><b>${money(num(r.cash) + num(r.card))}</b></td><td class="num">${money(r.expenses)}</td><td class="num">${money(r.waste)}</td>`
      : `<td colspan="5">${pill('idle', 'لم يُرسل التقرير')}</td>`) +
      `<td>${pill('num ' + (cnt >= TASK_COUNT ? 'ok' : cnt ? 'warn' : 'idle'), cnt + '/' + TASK_COUNT)}</td>` +
      `<td>${o ? pill('ok', o.item_count + ' صنف') : pill('idle', '—')}</td>` +
      `<td>${k ? pill('ok', 'تم') : pill('idle', '—')}</td>` +
      `<td>${esc((r && r.staff) || (o && o.staff) || (c && c.staff) || '—')}</td></tr>`;
  }).join('');
  $('f-cash').textContent = money(f.cash); $('f-card').textContent = money(f.card); $('f-total').textContent = money(f.cash + f.card);
  $('f-exp').textContent = money(f.exp); $('f-waste').textContent = money(f.waste);
  $('a-total').textContent = money(f.cash + f.card) + ' ر.س';
  $('a-reports').textContent = `${sent} / ${S.branches.length}`;
  $('a-orders').textContent = `${(d.orders || []).length} / ${S.branches.length}`;
  const notes = S.branches.map(b => reps[b.id]).filter(r => r && (r.notes || r.best));
  $('notesPanel').hidden = !notes.length;
  $('adminNotes').innerHTML = notes.map(r => `<li class="req"><span class="item">${esc(branchName(r.branch_id))}</span><span class="small muted">${esc(r.staff || '')}</span>` +
    `<span class="body">${r.best ? 'الأكثر مبيعاً: ' + esc(r.best) + (r.notes ? '\n' : '') : ''}${esc(r.notes || '')}</span></li>`).join('');
}

// ---------------------------------------------------------------- admin: orders & stock
function statusChips(docs, label) {
  const m = {}; (docs || []).forEach(x => { m[x.branch_id] = x; });
  return `<span class="pill ${docs.length === S.branches.length ? 'ok' : 'warn'} num">${docs.length} من ${S.branches.length} ${label}</span>` +
    S.branches.map(b => m[b.id] ? pill('ok', '✓ ' + shortBranch(b)) : pill('idle', shortBranch(b))).join('');
}
// rows: products in catalogue order that appear in any doc (plus deleted ones at the end)
function sheetRows(docs) {
  const pm = prodMap(), seen = {};
  docs.forEach(d => Object.keys(d.items || {}).forEach(k => { seen[k] = true; }));
  const rows = products().filter(p => seen[p.id]);
  Object.keys(seen).filter(k => !pm[k]).forEach(k => rows.push({ id: k, name: 'صنف محذوف', unit: '', category: NO_CAT }));
  return rows;
}
function buildSheetTable(docs, opts) {
  const byBranch = {}; docs.forEach(d => { byBranch[d.branch_id] = d.items || {}; });
  const cols = opts.split ? S.branches : [];
  const rows = sheetRows(docs);
  if (!rows.length) return { html: `<tbody><tr><td class="empty">${opts.empty}</td></tr></tbody>`, csv: [] };
  const head = ['الصنف', 'الوحدة'].concat(opts.totalFirst ? ['المجموع'] : []).concat(cols.map(shortBranch)).concat(opts.totalFirst ? [] : ['المجموع']);
  const csv = [head];
  let html = '<thead><tr>' + head.map((h, i) => `<th${i > 1 ? ' class="num"' : ''}>${esc(h)}</th>`).join('') + '</tr></thead><tbody>';
  groupByCat(rows).forEach(g => {
    html += `<tr><td class="cat" colspan="${head.length}">${esc(g.cat)}</td></tr>`;
    g.items.forEach(p => {
      let total = 0, any = false;
      const cells = cols.map(b => { const v = byBranch[b.id] ? byBranch[b.id][p.id] : undefined; if (v != null) { total += Number(v); any = true; } return v; });
      if (!cols.length) docs.forEach(d => { const v = (d.items || {})[p.id]; if (v != null) { total += Number(v); any = true; } });
      const cellHTML = v => v == null ? '<td class="num dim">—</td>' : `<td class="num${Number(v) === 0 && opts.zeroRed ? ' zero' : ''}">${money(v)}</td>`;
      const totalHTML = `<td class="num sum">${any ? money(total) : '—'}</td>`;
      html += `<tr><td>${esc(p.name)}</td><td class="muted">${esc(p.unit || '')}</td>` +
        (opts.totalFirst ? totalHTML : '') + cells.map(cellHTML).join('') + (opts.totalFirst ? '' : totalHTML) + '</tr>';
      const cr = [p.name, p.unit || ''];
      const cv = cells.map(v => v == null ? '' : Number(v));
      csv.push(opts.totalFirst ? cr.concat([total], cv) : cr.concat(cv, [any ? total : '']));
    });
  });
  return { html: html + '</tbody>', csv };
}
document.querySelectorAll('[data-aov]').forEach(b => b.addEventListener('click', () => {
  S.aoView = b.dataset.aov; document.querySelectorAll('[data-aov]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderAOrders();
}));
let aoCSV = [], asCSV = [];
function renderAOrders() {
  const docs = (S.data && S.data.orders) || [];
  $('ao-date').textContent = dateLabel(S.date);
  $('ao-status').innerHTML = statusChips(docs, 'أرسلوا');
  const t = buildSheetTable(docs, { split: S.aoView === 'split', totalFirst: true, empty: 'ما وصلت طلبيات لهذا اليوم' });
  $('ao-table').innerHTML = t.html; aoCSV = t.csv;
  const withExtra = S.branches.map(b => docs.find(d => d.branch_id === b.id)).filter(d => d && ((d.extras || []).length || d.notes));
  $('ao-extra-panel').hidden = !withExtra.length;
  $('ao-extras').innerHTML = withExtra.map(d => `<li class="req"><span class="item">${esc(branchName(d.branch_id))}</span><span class="small muted">${esc(d.staff || '')}</span>
      <span class="body">${(d.extras || []).map(x => '• ' + esc(x.name) + (x.qty ? ' — ' + esc(x.qty) : '')).join('\n')}${d.notes ? ((d.extras || []).length ? '\n' : '') + 'ملاحظة: ' + esc(d.notes) : ''}</span></li>`).join('');
}
$('ao-csv').addEventListener('click', () => {
  const docs = (S.data && S.data.orders) || [];
  if (!docs.length) { toast('ما فيه طلبيات لهذا اليوم'); return; }
  const full = buildSheetTable(docs, { split: true, totalFirst: true, empty: '' }).csv;
  const rows = full.slice();
  const extra = []; docs.forEach(d => (d.extras || []).forEach(x => extra.push([branchName(d.branch_id), x.name, x.qty])));
  if (extra.length) { rows.push([]); rows.push(['أصناف إضافية: الفرع', 'الصنف', 'الكمية']); extra.forEach(r => rows.push(r)); }
  downloadCSV('orders-' + S.date, rows);
});
function renderAStock() {
  const docs = (S.data && S.data.stocks) || [];
  $('as-date').textContent = dateLabel(S.date);
  $('as-status').innerHTML = statusChips(docs, 'سجّلوا الجرد');
  const t = buildSheetTable(docs, { split: true, totalFirst: false, zeroRed: true, empty: 'ما فيه جرد مسجل لهذا اليوم' });
  $('as-table').innerHTML = t.html; asCSV = t.csv;
}
$('as-csv').addEventListener('click', () => { if (!asCSV.length) { toast('ما فيه جرد لهذا اليوم'); return; } downloadCSV('stock-' + S.date, asCSV); });

// ---------------------------------------------------------------- admin: period
document.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => setPreset(b.dataset.p)));
['p-from', 'p-to'].forEach(id => $(id).addEventListener('change', () => {
  document.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', 'false'));
  if ($('p-from').value && $('p-to').value) loadPeriod($('p-from').value, $('p-to').value);
}));
function setPreset(p) {
  const t = S.today, dow = toDate(t).getUTCDay(); // 0 = Sunday, start of the Saudi school week
  const wk = addDays(t, -dow), mo = t.slice(0, 8) + '01';
  const lastMoEnd = addDays(mo, -1);
  const r = { week: [wk, t], lastweek: [addDays(wk, -7), addDays(wk, -1)], month: [mo, t], lastmonth: [lastMoEnd.slice(0, 8) + '01', lastMoEnd] }[p];
  document.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.p === p)));
  $('p-from').value = r[0]; $('p-to').value = r[1];
  loadPeriod(r[0], r[1]);
}
async function loadPeriod(from, to) {
  if (from > to) { toast('تاريخ البداية بعد النهاية'); return; }
  try {
    const d = await api('app_summary', { p_token: tok(), p_from: from, p_to: to });
    S.period = { from, to, data: d }; renderPeriod();
  } catch (err) { toast(errMsg(err)); }
}
function renderPeriod() {
  const { data } = S.period;
  let tot = 0, loss = 0;
  $('periodRows').innerHTML = data.branches.map(b => {
    const t = num(b.cash) + num(b.card); tot += t; loss += num(b.expenses) + num(b.waste);
    return `<tr><td>${esc(branchName(b.branch_id))}</td><td class="num">${b.days}</td><td class="num">${money(b.cash)}</td><td class="num">${money(b.card)}</td>` +
      `<td class="num"><b>${money(t)}</b></td><td class="num">${b.days ? money(t / b.days) : '—'}</td><td class="num">${money(b.expenses)}</td><td class="num">${money(b.waste)}</td></tr>`;
  }).join('');
  const days = data.days || [];
  $('p-total').textContent = money(tot) + ' ر.س';
  $('p-avg').textContent = days.length ? money(tot / days.length) : '0';
  $('p-loss').textContent = money(loss);
  const max = Math.max(1, ...days.map(d => num(d.total)));
  $('dayBars').innerHTML = days.length ? days.map(d =>
    `<li><span>${esc(shortDate(d.day))}</span><span class="track"><i style="width:${(num(d.total) / max * 100).toFixed(1)}%"></i></span><b>${money(d.total)}</b></li>`).join('')
    : '<li class="empty">ما فيه تقارير في هذي الفترة</li>';
}
$('exportBtn').addEventListener('click', () => {
  if (!S.period) return;
  const rows = [['الفرع', 'أيام التقارير', 'كاش', 'شبكة', 'الإجمالي', 'مصروفات', 'تالف']];
  S.period.data.branches.forEach(b => rows.push([branchName(b.branch_id), b.days, num(b.cash), num(b.card), num(b.cash) + num(b.card), num(b.expenses), num(b.waste)]));
  rows.push([]); rows.push(['اليوم', 'إجمالي المبيعات', 'عدد التقارير']);
  (S.period.data.days || []).forEach(d => rows.push([d.day, num(d.total), d.reports]));
  downloadCSV(`sales-${S.period.from}-to-${S.period.to}`, rows);
});

// ---------------------------------------------------------------- admin: settings
let boardDirty = false;
$('b-text').addEventListener('input', () => { boardDirty = true; });
$('boardForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('b-text').value.trim();
  try { await api('app_set_board', { p_token: tok(), p_text: text }); boardDirty = false; toast(text ? 'انتشر التعميم' : 'انشال التعميم'); load(true); }
  catch (err) { toast(errMsg(err)); }
});
async function renderPins() {
  if (!boardDirty) $('b-text').value = (S.data && S.data.board && S.data.board.body) || '';
  try { await loadStatus(); } catch (e) {}
  $('pinList').innerHTML = S.branches.map(b => `<li>
      <span>${esc(b.name)}</span>
      ${pill(b.ready ? 'ok' : 'bad', b.ready ? 'له رقم سري' : 'بدون رقم')}
      <form data-pin="${esc(b.id)}" novalidate>
        <input type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" placeholder="رقم جديد (4–8 أرقام)" aria-label="رقم سري جديد لـ ${esc(b.name)}">
        <button class="btn ghost" type="submit">تعيين</button>
      </form></li>`).join('');
}
$('pinList').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, id = f.dataset.pin, input = f.querySelector('input'), pin = digits(input.value);
  if (!/^[0-9]{4,8}$/.test(pin)) { toast(MSG.BAD_PIN_FORMAT); return; }
  try { await api('app_set_branch_pin', { p_token: tok(), p_branch: id, p_pin: pin }); input.value = ''; toast('تم تعيين الرقم السري لـ ' + branchName(id)); renderPins(); }
  catch (err) { toast(errMsg(err)); }
});

// products
let editingProd = null;
function renderProducts() {
  if (editingProd) return;
  const q = norm($('prod-q').value);
  const active = products().filter(p => p.active !== false);
  $('prod-count').textContent = active.length + ' صنف';
  const list = active.filter(p => !q || norm(p.name + ' ' + (p.category || '')).includes(q));
  $('prodList').innerHTML = list.length ? list.map(p => `<li data-prod="${esc(p.id)}">
      <div class="pinfo"><span>${esc(p.name)}</span><small>${esc([p.unit, p.category || NO_CAT, KIND_LABEL[p.kind] || ''].filter(Boolean).join(' · '))}</small></div>
      <div class="pbtns"><button type="button" data-pedit>تعديل</button><button type="button" class="danger" data-pdel>حذف</button></div></li>`).join('')
    : `<li class="empty">${active.length ? 'ما فيه صنف بهذا الاسم' : 'ما فيه أصناف بعد. أضفها من الخانة اللي فوق.'}</li>`;
}
$('prod-q').addEventListener('input', renderProducts);
function parseBulk(text, kind) {
  return text.split(/\r?\n/).map(line => {
    const parts = (line.includes('\t') ? line.split('\t') : line.split(/[،,|]/)).map(s => s.trim());
    return { name: parts[0] || '', unit: parts[1] || '', category: parts[2] || '', kind };
  }).filter(x => x.name);
}
$('bulkForm').addEventListener('submit', async e => {
  e.preventDefault();
  const items = parseBulk($('bulk').value, $('bulk-kind').value);
  if (!items.length) { toast('اكتب صنف واحد على الأقل'); return; }
  if (items.length > 500) { toast('أكثر شي 500 صنف في المرة'); return; }
  $('bulk-btn').disabled = true;
  try {
    const r = await api('app_products_add', { p_token: tok(), p_items: items });
    $('bulk').value = '';
    toast(`انضاف ${r.added} صنف` + (r.skipped ? `، و${r.skipped} موجودة من قبل` : ''));
    await load(true); renderProducts();
  } catch (err) { toast(errMsg(err)); }
  finally { $('bulk-btn').disabled = false; }
});
$('prodList').addEventListener('click', async e => {
  const li = e.target.closest('li[data-prod]'); if (!li) return;
  const id = li.dataset.prod, p = products().find(x => x.id === id); if (!p) return;
  if (e.target.closest('[data-pdel]')) {
    const b = e.target.closest('[data-pdel]');
    if (!b.classList.contains('confirm')) {
      b.classList.add('confirm'); b.textContent = 'تأكيد الحذف';
      setTimeout(() => { if (b.isConnected) { b.classList.remove('confirm'); b.textContent = 'حذف'; } }, 4000);
      return;
    }
    try { await api('app_product_delete', { p_token: tok(), p_id: id }); toast('انحذف ' + p.name); await load(true); renderProducts(); }
    catch (err) { toast(errMsg(err)); }
    return;
  }
  if (e.target.closest('[data-pedit]')) {
    editingProd = id;
    li.innerHTML = `<form data-pform novalidate>
        <input name="name" aria-label="اسم الصنف" value="${esc(p.name)}">
        <input name="unit" aria-label="الوحدة" placeholder="الوحدة" value="${esc(p.unit || '')}">
        <input name="category" aria-label="القسم" placeholder="القسم" value="${esc(p.category || '')}">
        <select name="kind" aria-label="يظهر في">${Object.keys(KIND_LABEL).map(k => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${KIND_LABEL[k]}</option>`).join('')}</select>
        <div class="actions"><button class="btn small-btn" type="submit">حفظ</button><button class="btn ghost small-btn" type="button" data-pcancel>إلغاء</button></div>
      </form>`;
    li.querySelector('input').focus();
  }
  if (e.target.closest('[data-pcancel]')) { editingProd = null; renderProducts(); }
});
$('prodList').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, id = f.closest('li').dataset.prod;
  const val = n => f.elements[n].value.trim(); // f.name is the form's own name, so read fields through elements
  const body = { name: val('name'), unit: val('unit'), category: val('category'), kind: val('kind') };
  if (!body.name) { toast('اكتب اسم الصنف'); return; }
  try { await api('app_product_update', { p_token: tok(), p_id: id, p: body }); editingProd = null; toast('انحفظ التعديل'); await load(true); renderProducts(); }
  catch (err) { toast(errMsg(err)); }
});

// ---------------------------------------------------------------- boot
if (!CFG.SUPABASE_URL || !CFG.SUPABASE_KEY) show('setup');
else if (S.sess && S.sess.token) { show('app'); loadStatus().catch(() => {}).finally(startApp); }
else showLogin();
})();
