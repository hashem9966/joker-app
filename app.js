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
    ['c1', 'جرد المتبقي وتسجيل التالف'],
    ['c2', 'عدّ الصندوق وتسليم الكاش'],
    ['c3', 'تنظيف الأجهزة والأرضية'],
    ['c4', 'إحكام إغلاق الثلاجات وإطفاء باقي الأجهزة'],
    ['c5', 'إخراج النفايات']] }
];
const TASK_COUNT = TASKS.reduce((n, g) => n + g.items.length, 0);
const STATUS = { new: 'جديد', ordered: 'تم الطلب', delivered: 'وصل' };
const STAFF_TABS = [['home', 'الرئيسية'], ['checklist', 'مهام اليوم'], ['report', 'تقرير الإغلاق'], ['requests', 'النواقص']];
const ADMIN_TABS = [['overview', 'اليوم'], ['allreq', 'النواقص'], ['period', 'تقرير فترة'], ['settings', 'الإعدادات']];
const MSG = {
  NETWORK: 'ما فيه اتصال بالإنترنت، حاول مرة ثانية',
  SESSION_EXPIRED: 'انتهت الجلسة، سجّل دخول من جديد',
  DAY_LOCKED: 'ما يمكن تعديل يوم أقدم من 3 أيام، كلّمي الإدارة',
  BAD_DAY: 'التاريخ غير صحيح',
  NOT_ADMIN: 'هذا للإدارة فقط',
  BRANCH_ONLY: 'هذا للفروع فقط',
  BAD_PIN_FORMAT: 'الرقم السري لازم يكون من 4 إلى 8 أرقام',
  BAD_INPUT: 'تأكد من البيانات المكتوبة',
  BAD_RANGE: 'الفترة لازم تكون أقل من 3 شهور',
  BAD_PIN: 'الرقم السري غلط',
  LOCKED: 'محاولات غلط كثيرة. انتظر 15 دقيقة وحاول مرة ثانية',
  NO_PIN: 'هذا الفرع ما له رقم سري بعد، اطلبيه من الإدارة'
};

// ---------------------------------------------------------------- helpers
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });
const money = v => nf.format(Number(v) || 0);
const num = v => {
  const s = String(v == null ? '' : v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫,]/g, '.');
  const n = parseFloat(s); return isFinite(n) && n >= 0 ? n : 0;
};
const digits = v => String(v || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
const riyadhDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const toDate = iso => new Date(iso + 'T12:00:00Z');
const addDays = (iso, n) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dateLabel = (iso, opts) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', opts || { weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(iso));
const timeLabel = iso => { try { return new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; } };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
};
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function notice(t) { $('notice').textContent = t || ''; $('notice').hidden = !t; }
const errMsg = e => MSG[e && e.code] || 'صار خطأ، حاول مرة ثانية';

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
const S = {
  sess: null, branches: [], today: riyadhDate(), date: riyadhDate(), view: null,
  data: null, urg: 'normal', reqFilter: 'open', adminReqFilter: 'open', period: null
};
try { S.sess = JSON.parse(store.get('sess') || 'null'); } catch (e) { S.sess = null; }
const tok = () => S.sess && S.sess.token;
const isAdmin = () => !!(S.sess && S.sess.is_admin);
const branchName = id => (S.branches.find(b => b.id === id) || {}).name || id;

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
  const t = tok(); endSession();
  if (t) { try { await api('app_logout', { p_token: t }); } catch (e) {} }
});

// ---------------------------------------------------------------- app shell
async function startApp() {
  show('app');
  notice('');
  const tabs = isAdmin() ? ADMIN_TABS : STAFF_TABS;
  $('tabs').innerHTML = tabs.map(([v, l]) => `<button class="tab" role="tab" type="button" data-view="${v}">${l}${v === 'requests' || v === 'allreq' ? ' <span class="count num" data-count hidden></span>' : ''}</button>`).join('');
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
function go(v) {
  S.view = v;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === v)));
  document.querySelectorAll('main > .view').forEach(s => { s.hidden = s.id !== 'v-' + v; });
  $('date').parentElement.parentElement.hidden = v === 'period' || v === 'settings' || v === 'allreq';
  if (v === 'period' && !S.period) setPreset('week');
  if (v === 'settings') renderSettings();
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
    if (!isAdmin() && d.staff) { store.set('staff', d.staff); }
    notice('');
    renderAll();
  } catch (e) {
    if (e.code !== 'SESSION_EXPIRED' && !silent) notice(errMsg(e));
  } finally { loading = false; }
}
function busyEditing() {
  const a = document.activeElement;
  return formDirty || boardDirty || pending || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('app').contains(a));
}
setInterval(() => { if (document.visibilityState === 'visible' && tok() && !busyEditing()) load(true); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && tok() && !busyEditing()) load(true); });

function renderAll() {
  updateDateBounds();
  if (isAdmin()) { renderOverview(); renderAllRequests(); }
  else { renderHome(); renderChecklist(); renderReport(); renderRequests(); }
}
function setCount(n) { document.querySelectorAll('[data-count]').forEach(c => { c.hidden = !n; c.textContent = n; }); }

// ---------------------------------------------------------------- requests (shared)
function reqRow(r, showBranch) {
  const opts = Object.keys(STATUS).map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${STATUS[s]}</option>`).join('');
  return `<li class="req"><span class="item">${r.urgent ? '<span class="urgent">عاجل · </span>' : ''}${esc(r.item)}${r.qty ? ` <span class="muted">— ${esc(r.qty)}</span>` : ''}</span>
    <select aria-label="حالة الطلب" data-req="${esc(r.id)}">${opts}</select>
    <span class="meta">${showBranch ? esc(branchName(r.branch_id)) + ' · ' : ''}${esc(dateLabel(new Date(r.created_at).toISOString().slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' }))} ${esc(timeLabel(r.created_at))}${r.staff ? ' · ' + esc(r.staff) : ''}</span></li>`;
}
document.addEventListener('change', async e => {
  const id = e.target.dataset && e.target.dataset.req; if (!id) return;
  const st = e.target.value; e.target.disabled = true;
  try { await api('app_set_request_status', { p_token: tok(), p_id: id, p_status: st }); toast('تحدّثت الحالة: ' + STATUS[st]); await load(true); }
  catch (err) { toast(errMsg(err)); }
  finally { e.target.disabled = false; }
});

// ---------------------------------------------------------------- staff: home
function renderHome() {
  const d = S.data || {};
  $('homeTitle').textContent = (S.sess.name || '') + ' · ' + dateLabel(S.date);
  const b = d.board && d.board.body; $('boardBox').hidden = !b; $('boardText').textContent = b || '';
  const n = d.checklist ? d.checklist.done_count : 0;
  const sc = $('stCheck'); sc.className = 'pill num ' + (n >= TASK_COUNT ? 'ok' : n ? 'warn' : 'idle'); sc.textContent = `${n}/${TASK_COUNT}`;
  const r = d.report; const sr = $('stReport'); sr.className = 'pill ' + (r ? 'ok' : 'idle'); sr.textContent = r ? money(num(r.cash) + num(r.card)) + ' ر.س' : 'لم يُرسل';
  const open = (d.requests || []).filter(x => x.status !== 'delivered');
  const urgent = open.some(x => x.urgent && x.status === 'new');
  const sq = $('stReq'); sq.className = 'pill ' + (urgent ? 'bad' : open.length ? 'warn' : 'ok'); sq.textContent = open.length ? open.length + ' مفتوح' : 'لا يوجد';
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
  e.stopPropagation();
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

// ---------------------------------------------------------------- staff: requests
document.querySelectorAll('[data-urg]').forEach(b => b.addEventListener('click', () => {
  S.urg = b.dataset.urg; document.querySelectorAll('[data-urg]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
}));
document.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
  S.reqFilter = b.dataset.f; document.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderRequests();
}));
$('reqForm').addEventListener('submit', async e => {
  e.preventDefault();
  const item = $('q-item').value.trim(); if (!item) { toast('اكتبي اسم الصنف'); $('q-item').focus(); return; }
  $('reqBtn').disabled = true;
  try {
    await api('app_add_request', { p_token: tok(), p_item: item, p_qty: $('q-qty').value.trim(), p_urgent: S.urg === 'urgent' });
    $('q-item').value = ''; $('q-qty').value = ''; toast('انرسل الطلب للإدارة'); await load(true);
  } catch (err) { toast(errMsg(err)); }
  finally { $('reqBtn').disabled = false; }
});
function renderRequests() {
  const all = (S.data && S.data.requests) || [];
  const list = S.reqFilter === 'open' ? all.filter(r => r.status !== 'delivered') : all;
  $('reqList').innerHTML = list.length ? list.map(r => reqRow(r, false)).join('')
    : `<li class="empty">${S.reqFilter === 'open' ? 'ما فيه نواقص مفتوحة لهذا الفرع' : 'ما فيه طلبات في آخر أسبوعين'}</li>`;
  setCount(all.filter(r => r.status !== 'delivered').length);
}

// ---------------------------------------------------------------- admin: overview
function renderOverview() {
  const d = S.data || {};
  $('adminDate').textContent = dateLabel(S.date);
  const reps = {}; (d.reports || []).forEach(r => { reps[r.branch_id] = r; });
  const chk = {}; (d.checklists || []).forEach(c => { chk[c.branch_id] = c; });
  const f = { cash: 0, card: 0, exp: 0, waste: 0 }; let sent = 0;
  $('adminRows').innerHTML = S.branches.map(b => {
    const r = reps[b.id], c = chk[b.id], cnt = c ? c.done_count : 0;
    if (r) { sent++; f.cash += num(r.cash); f.card += num(r.card); f.exp += num(r.expenses); f.waste += num(r.waste); }
    const pill = `<span class="pill num ${cnt >= TASK_COUNT ? 'ok' : cnt ? 'warn' : 'idle'}">${cnt}/${TASK_COUNT}</span>`;
    return `<tr><td>${esc(b.name)}</td>` + (r
      ? `<td class="num">${money(r.cash)}</td><td class="num">${money(r.card)}</td><td class="num"><b>${money(num(r.cash) + num(r.card))}</b></td><td class="num">${money(r.expenses)}</td><td class="num">${money(r.waste)}</td>`
      : `<td colspan="5"><span class="pill idle">لم يُرسل التقرير</span></td>`) +
      `<td>${pill}</td><td>${esc((r && r.staff) || (c && c.staff) || '—')}</td></tr>`;
  }).join('');
  $('f-cash').textContent = money(f.cash); $('f-card').textContent = money(f.card); $('f-total').textContent = money(f.cash + f.card);
  $('f-exp').textContent = money(f.exp); $('f-waste').textContent = money(f.waste);
  $('a-total').textContent = money(f.cash + f.card) + ' ر.س';
  $('a-reports').textContent = `${sent} / ${S.branches.length}`;
  const open = (d.requests || []).filter(r => r.status !== 'delivered');
  $('a-req').textContent = open.length; setCount(open.length);
  const notes = S.branches.map(b => reps[b.id]).filter(r => r && (r.notes || r.best));
  $('notesPanel').hidden = !notes.length;
  $('adminNotes').innerHTML = notes.map(r => `<li class="req"><span class="item">${esc(branchName(r.branch_id))}</span><span class="small muted">${esc(r.staff || '')}</span>` +
    `<span class="body">${r.best ? 'الأكثر مبيعاً: ' + esc(r.best) + (r.notes ? '\n' : '') : ''}${esc(r.notes || '')}</span></li>`).join('');
}

// ---------------------------------------------------------------- admin: all requests
document.querySelectorAll('[data-af]').forEach(b => b.addEventListener('click', () => {
  S.adminReqFilter = b.dataset.af; document.querySelectorAll('[data-af]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderAllRequests();
}));
function renderAllRequests() {
  const all = ((S.data && S.data.requests) || []).slice();
  let list = S.adminReqFilter === 'open' ? all.filter(r => r.status !== 'delivered') : all;
  if (S.adminReqFilter === 'open') list.sort((a, b) => (b.urgent - a.urgent) || (a.created_at < b.created_at ? 1 : -1));
  $('allReqList').innerHTML = list.length ? list.map(r => reqRow(r, true)).join('') : '<li class="empty">ما فيه نواقص مفتوحة</li>';
}

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
    `<li><span>${esc(dateLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' }))}</span><span class="track"><i style="width:${(num(d.total) / max * 100).toFixed(1)}%"></i></span><b>${money(d.total)}</b></li>`).join('')
    : '<li class="empty">ما فيه تقارير في هذي الفترة</li>';
}
$('exportBtn').addEventListener('click', () => {
  if (!S.period) return;
  const rows = [['الفرع', 'أيام التقارير', 'كاش', 'شبكة', 'الإجمالي', 'مصروفات', 'تالف']];
  S.period.data.branches.forEach(b => rows.push([branchName(b.branch_id), b.days, num(b.cash), num(b.card), num(b.cash) + num(b.card), num(b.expenses), num(b.waste)]));
  rows.push([]); rows.push(['اليوم', 'إجمالي المبيعات', 'عدد التقارير']);
  (S.period.data.days || []).forEach(d => rows.push([d.day, num(d.total), d.reports]));
  const csv = '﻿' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `مبيعات-المقاصف-${S.period.from}-إلى-${S.period.to}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
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
async function renderSettings() {
  if (!boardDirty) $('b-text').value = (S.data && S.data.board && S.data.board.body) || '';
  try { await loadStatus(); } catch (e) {}
  $('pinList').innerHTML = S.branches.map(b => `<li>
      <span>${esc(b.name)}</span>
      <span class="pill ${b.ready ? 'ok' : 'bad'}">${b.ready ? 'له رقم سري' : 'بدون رقم'}</span>
      <form data-pin="${esc(b.id)}" novalidate>
        <input type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" placeholder="رقم جديد (4–8 أرقام)" aria-label="رقم سري جديد لـ ${esc(b.name)}">
        <button class="btn ghost" type="submit">تعيين</button>
      </form></li>`).join('');
}
$('pinList').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, id = f.dataset.pin, input = f.querySelector('input'), pin = digits(input.value);
  if (!/^[0-9]{4,8}$/.test(pin)) { toast(MSG.BAD_PIN_FORMAT); return; }
  try { await api('app_set_branch_pin', { p_token: tok(), p_branch: id, p_pin: pin }); input.value = ''; toast('تم تعيين الرقم السري لـ ' + branchName(id)); renderSettings(); }
  catch (err) { toast(errMsg(err)); }
});

// ---------------------------------------------------------------- boot
if (!CFG.SUPABASE_URL || !CFG.SUPABASE_KEY) show('setup');
else if (S.sess && S.sess.token) { show('app'); loadStatus().catch(() => {}).finally(startApp); }
else showLogin();
})();
