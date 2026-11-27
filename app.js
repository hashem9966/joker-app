/* دفتر المقاصف — staff & admin web app (no build step, no libraries) */
(function () {
'use strict';

const CFG = window.APP_CONFIG || {};
const APP_VERSION = '4'; // bump together with version.json and the ?v= in index.html

// load the newest site after an update (browsers and home-screen apps keep old copies)
function checkVersion() {
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
    if (!j || j.v === APP_VERSION) return;
    let tried = null; try { tried = sessionStorage.getItem('reloadedFor'); } catch (e) {}
    if (tried === j.v || (typeof anyDirty === 'function' && tok() && anyDirty())) return;
    try { sessionStorage.setItem('reloadedFor', j.v); } catch (e) {}
    location.reload();
  }).catch(() => {});
}

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
    ['c3', 'تنظيف الأجهزة'],
    ['c4', 'إحكام إغلاق الثلاجات وإطفاء باقي الأجهزة'],
    ['c5', 'إرسال النواقص']] }
];
const TASK_IDS = TASKS.flatMap(g => g.items.map(i => i[0]));
const TASK_COUNT = TASK_IDS.length;
const STAFF_TABS = [['home', 'الرئيسية'], ['checklist', 'مهام اليوم'], ['report', 'تقرير الإغلاق'], ['order', 'النواقص'], ['stock', 'الجرد']];
const ADMIN_TABS = [['overview', 'اليوم'], ['aorders', 'النواقص'], ['astock', 'الجرد'], ['period', 'تقرير فترة'], ['settings', 'الإعدادات']];
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
  BAD_PHOTO: 'ما قدرنا نرفع الصورة، جربي صورة ثانية',
  TOO_MANY_PHOTOS: 'وصلتوا الحد اليومي للصور'
};
const CAMERA_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';

// ---------------------------------------------------------------- helpers
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });
const money = v => nf.format(Number(v) || 0);
const westDigits = s => String(s == null ? '' : s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const num = v => { const n = parseFloat(westDigits(v).replace(/[٫,]/g, '.')); return isFinite(n) && n >= 0 ? n : 0; };
const digits = v => westDigits(v).replace(/\D/g, '');
const norm = s => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْـ]/g, '').replace(/\s+/g, ' ').trim();
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
// "2 كرتون" + "3 كرتون" + "1 حبة" -> "5 كرتون + 1 حبة"; text without a number is listed as is
function sumQty(list) {
  const units = [], byUnit = {}, other = [];
  list.forEach(q => {
    const s = westDigits(q || '').trim(); if (!s) return;
    const m = s.match(/^(\d+(?:[.,٫]\d+)?)\s*(.*)$/);
    if (!m) { other.push(s); return; }
    const k = norm(m[2]);
    if (!(k in byUnit)) { byUnit[k] = { n: 0, unit: m[2].trim() }; units.push(k); }
    byUnit[k].n += parseFloat(m[1].replace(/[,٫]/, '.'));
  });
  return units.map(k => (nf.format(byUnit[k].n) + ' ' + byUnit[k].unit).trim()).concat(other).join(' + ');
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
const S = { sess: null, branches: [], today: riyadhDate(), date: riyadhDate(), view: null, data: null, period: null, aview: { order: 'total', stock: 'total' } };
try { S.sess = JSON.parse(store.get('sess') || 'null'); } catch (e) { S.sess = null; }
const tok = () => S.sess && S.sess.token;
const isAdmin = () => !!(S.sess && S.sess.is_admin);
const branchName = id => (S.branches.find(b => b.id === id) || {}).name || id;
const shortBranch = b => b.name.replace(/^(مقصف|كوفي)\s+/, '');

function show(screen) { ['login', 'setup', 'app'].forEach(id => { $(id).hidden = id !== screen; }); }

// ---------------------------------------------------------------- photos
const PHOTOS = {}; // id -> data URL
async function fetchPhotos(ids) {
  const need = [...new Set(ids)].filter(id => id && !PHOTOS[id]);
  for (let i = 0; i < need.length; i += 100) {
    try { Object.assign(PHOTOS, await api('app_photos', { p_token: tok(), p_ids: need.slice(i, i + 100) })); } catch (e) {}
  }
  document.querySelectorAll('img[data-photo]').forEach(img => { const d = PHOTOS[img.dataset.photo]; if (d && img.src !== d) img.src = d; });
}
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const max = 900, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = 0.72, d = c.toDataURL('image/jpeg', q);
      while (d.length > 380000 && q > 0.3) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
      resolve(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject({ code: 'BAD_PHOTO' }); };
    img.src = url;
  });
}
const photoImg = (id, cls) => `<img ${cls ? `class="${cls}" ` : ''}data-photo="${esc(id)}" src="${esc(PHOTOS[id] || '')}" alt="صورة المنتج">`;
// lightbox
let lbDelete = null;
function openLightbox(id, onDelete) {
  $('lb-img').removeAttribute('data-photo');
  $('lb-img').setAttribute('data-photo', id); $('lb-img').src = PHOTOS[id] || '';
  lbDelete = onDelete || null; $('lb-del').hidden = !onDelete;
  $('lightbox').hidden = false; $('lb-close').focus();
  if (!PHOTOS[id]) fetchPhotos([id]);
}
function closeLightbox() { $('lightbox').hidden = true; lbDelete = null; }
$('lb-close').addEventListener('click', closeLightbox);
$('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) closeLightbox(); });
$('lb-del').addEventListener('click', () => { if (lbDelete) lbDelete(); closeLightbox(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('lightbox').hidden) closeLightbox(); });
document.addEventListener('click', e => { const b = e.target.closest('[data-open-photo]'); if (b) openLightbox(b.dataset.openPhoto); });

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
  if (v === 'settings') renderPins();
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
  return anyDirty() || !$('lightbox').hidden || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('app').contains(a));
}
setInterval(() => { if (document.visibilityState === 'visible' && tok() && !busyEditing()) load(true); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && tok() && !busyEditing()) load(true); });
window.addEventListener('beforeunload', e => { if (tok() && (SH.order.dirty || SH.stock.dirty || formDirty)) { e.preventDefault(); e.returnValue = ''; } });

function renderAll() {
  updateDateBounds();
  if (isAdmin()) { renderOverview(); renderAdminRows('order'); renderAdminRows('stock'); }
  else { renderHome(); renderChecklist(); renderReport(); syncSheet('order'); syncSheet('stock'); }
}

// ---------------------------------------------------------------- staff: home
function renderHome() {
  const d = S.data || {};
  $('homeTitle').textContent = (S.sess.name || '') + ' · ' + dateLabel(S.date);
  const b = d.board && d.board.body; $('boardBox').hidden = !b; $('boardText').textContent = b || '';
  const done = (d.checklist && d.checklist.done) || {}, n = TASK_IDS.filter(id => done[id]).length;
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
const countDone = done => TASK_IDS.filter(id => done[id]).length;
function renderChecklist() {
  const c = (S.data && S.data.checklist) || {};
  const done = pending ? pending : (c.done || {});
  $('checkGroups').innerHTML = TASKS.map(g => {
    const k = g.items.filter(i => done[i[0]]).length;
    return `<div class="check-group"><h3><span>${esc(g.group)}</span><span class="num">${k}/${g.items.length}</span></h3>` +
      g.items.map(([id, txt]) => `<label class="check" for="t-${id}"><input type="checkbox" id="t-${id}" data-task="${id}" ${done[id] ? 'checked' : ''}><span>${esc(txt)}</span></label>`).join('') + '</div>';
  }).join('');
  setCheckProgress(countDone(done));
  $('checkMeta').textContent = c.updated_at ? `آخر تحديث ${timeLabel(c.updated_at)}${c.staff ? ' · ' + c.staff : ''}` : '';
}
function setCheckProgress(n) { $('checkPct').textContent = `${n} من ${TASK_COUNT}`; $('checkBar').style.width = (n / TASK_COUNT * 100) + '%'; }
$('checkGroups').addEventListener('change', e => {
  const id = e.target.dataset && e.target.dataset.task; if (!id) return;
  const base = pending || ((S.data && S.data.checklist && S.data.checklist.done) || {});
  pending = {}; TASK_IDS.forEach(t => { if (base[t]) pending[t] = true; });
  if (e.target.checked) pending[id] = true; else delete pending[id];
  setCheckProgress(countDone(pending));
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
['r-cash', 'r-card', 'r-best', 'r-notes'].forEach(id => $(id).addEventListener('input', () => { formDirty = true; calcTotals(); }));
function calcTotals() {
  const c = num($('r-cash').value), k = num($('r-card').value);
  $('t-total').textContent = money(c + k); $('t-hand').textContent = money(c);
  $('t-cardpct').textContent = (c + k ? Math.round(k / (c + k) * 100) : 0) + '٪';
}
function renderReport() {
  const r = S.data && S.data.report;
  if (!formDirty) {
    const f = v => (r && Number(v)) ? String(Number(v)) : '';
    $('r-cash').value = f(r && r.cash); $('r-card').value = f(r && r.card);
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
  const p = { cash: num($('r-cash').value), card: num($('r-card').value), expenses: 0, waste: 0,
    best: $('r-best').value.trim(), notes: $('r-notes').value.trim(), staff: (S.data && S.data.staff) || store.get('staff') || '' };
  $('reportBtn').disabled = true;
  try {
    const r = await api('app_save_report', { p_token: tok(), p_day: S.date, p: p });
    formDirty = false; if (S.data) S.data.report = r; renderReport(); renderHome(); toast('انحفظ التقرير');
  } catch (err) { toast(errMsg(err)); }
  finally { $('reportBtn').disabled = false; }
});

// ---------------------------------------------------------------- staff: shortages & stock (free rows)
const SH = {
  order: { rows: [], notes: '', dirty: false, key: null },
  stock: { rows: [], notes: '', dirty: false, key: null }
};
const docOf = mode => S.data && S.data[mode];
const prevOf = mode => S.data && S.data['prev_' + mode];
const named = rows => rows.filter(r => (r.name || '').trim());
const sheetKey = () => (S.sess && S.sess.branch) + '|' + S.date;
const draftKey = (mode, key) => 'draft2:' + mode + ':' + key;
const cleanRow = r => { const o = { name: r.name || '', qty: r.qty || '' }; if (r.photo) o.photo = r.photo; return o; };

// drafts: everything typed is kept on the phone until it is sent
const draftTimers = {};
function writeDraft(mode) {
  clearTimeout(draftTimers[mode]); draftTimers[mode] = null;
  const st = SH[mode];
  if (st.dirty && st.key) store.set(draftKey(mode, st.key), JSON.stringify({ rows: st.rows.map(cleanRow), notes: st.notes, at: Date.now() }));
}
function saveDraft(mode) { clearTimeout(draftTimers[mode]); draftTimers[mode] = setTimeout(() => writeDraft(mode), 300); }
const flushDrafts = () => { ['order', 'stock'].forEach(m => { if (draftTimers[m]) writeDraft(m); }); };
window.addEventListener('pagehide', flushDrafts);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDrafts(); });

function syncSheet(mode) {
  const st = SH[mode], key = sheetKey(), doc = docOf(mode);
  if (st.key === key && st.dirty) { renderSheetMeta(mode); return; }
  st.key = key; st.dirty = false;
  st.rows = ((doc && doc.extras) || []).map(cleanRow);
  st.notes = (doc && doc.notes) || '';
  let draft = null; try { draft = JSON.parse(store.get(draftKey(mode, key)) || 'null'); } catch (e) {}
  if (draft && (!doc || draft.at > Date.parse(doc.updated_at))) { st.rows = (draft.rows || []).map(cleanRow); st.notes = draft.notes || ''; st.dirty = true; }
  else if (draft) store.set(draftKey(mode, key), null);
  renderRows(mode);
  if (mode === 'order') fetchPhotos(st.rows.map(r => r.photo));
}
function rowHTML(mode, r, i) {
  const isOrder = mode === 'order';
  let photo = '';
  if (isOrder) {
    photo = r.uploading ? `<span class="icon-btn busy" aria-label="جاري رفع الصورة">…</span>`
      : r.photo ? `<button type="button" class="thumb" data-view-photo aria-label="عرض الصورة">${photoImg(r.photo)}</button>`
      : `<button type="button" class="icon-btn" data-cam aria-label="أضيفي صورة للمنتج">${CAMERA_SVG}</button>`;
  }
  return `<div class="frow" data-i="${i}">
    <input data-f="name" enterkeyhint="next" autocomplete="off" placeholder="${isOrder ? 'اسم الصنف' : 'اسم الصنف'}" aria-label="الصنف ${i + 1}" value="${esc(r.name)}">
    <input data-f="qty" class="qty" enterkeyhint="next" autocomplete="off" placeholder="${isOrder ? 'الكمية' : 'المتبقي'}" aria-label="${isOrder ? 'الكمية المطلوبة' : 'المتبقي'} ${i + 1}" value="${esc(r.qty)}">
    <div class="fbtns">${photo}<button type="button" class="icon-btn del" data-del aria-label="حذف السطر ${i + 1}">×</button></div></div>`;
}
function renderRows(mode) {
  const st = SH[mode];
  if (!st.rows.length) st.rows.push({ name: '', qty: '' });
  $(mode + '-rows').innerHTML = st.rows.map((r, i) => rowHTML(mode, r, i)).join('');
  if (mode === 'order' && document.activeElement !== $('order-notes')) $('order-notes').value = st.notes;
  renderSheetMeta(mode);
}
function renderSheetMeta(mode) {
  const st = SH[mode], doc = docOf(mode), n = named(st.rows).length;
  $(mode + '-count').textContent = n + ' صنف';
  $(mode + '-count').parentElement.classList.toggle('dirty', st.dirty);
  const state = $(mode + '-state');
  state.className = 'pill ' + (st.dirty ? 'warn' : doc ? 'ok' : 'idle');
  state.textContent = st.dirty ? 'مسودة' : doc ? (mode === 'order' ? 'انرسلت' : 'تم الجرد') : (mode === 'order' ? 'لم تُرسل' : 'لم يُسجل');
  $(mode + '-meta').textContent = doc ? `آخر حفظ ${timeLabel(doc.updated_at)}${doc.staff ? ' · ' + doc.staff : ''}. تقدرين تعدّلين وتحفظين مرة ثانية.` : '';
  $(mode + '-save').textContent = mode === 'order' ? (doc ? 'تحديث النواقص' : 'إرسال النواقص') : (doc ? 'تحديث الجرد' : 'حفظ الجرد');
  const prev = prevOf(mode), btn = $(mode + '-copy');
  btn.hidden = !(prev && prev.item_count > 0 && n === 0);
  if (!btn.hidden) btn.textContent = `نسخ أسماء الأصناف من ${shortDate(prev.day)} (${prev.item_count} صنف)`;
  if (!isAdmin()) renderHome();
}
function touch(mode) { SH[mode].dirty = true; renderSheetMeta(mode); saveDraft(mode); }
function addRow(mode, focus) {
  SH[mode].rows.push({ name: '', qty: '' }); renderRows(mode);
  if (focus) { const rows = $(mode + '-rows').querySelectorAll('.frow'); rows[rows.length - 1].querySelector('[data-f="name"]').focus(); }
}
let camTarget = null;
['order', 'stock'].forEach(mode => {
  const box = $(mode + '-rows');
  box.addEventListener('input', e => {
    const f = e.target.dataset.f; if (!f) return;
    SH[mode].rows[Number(e.target.closest('.frow').dataset.i)][f] = e.target.value; touch(mode);
  });
  box.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.dataset.f) return;
    e.preventDefault();
    const row = e.target.closest('.frow'), i = Number(row.dataset.i);
    if (e.target.dataset.f === 'name') { row.querySelector('[data-f="qty"]').focus(); return; }
    const next = box.querySelector(`.frow[data-i="${i + 1}"] [data-f="name"]`);
    if (next) next.focus(); else addRow(mode, true);
  });
  box.addEventListener('click', e => {
    const row = e.target.closest('.frow'); if (!row) return;
    const i = Number(row.dataset.i), st = SH[mode];
    if (e.target.closest('[data-del]')) {
      if (st.rows.length === 1) st.rows[0] = { name: '', qty: '' }; else st.rows.splice(i, 1);
      renderRows(mode); touch(mode); return;
    }
    if (e.target.closest('[data-cam]')) { camTarget = { mode, row: st.rows[i] }; $('photoInput').value = ''; $('photoInput').click(); return; }
    if (e.target.closest('[data-view-photo]')) {
      const r = st.rows[i];
      openLightbox(r.photo, () => { delete r.photo; renderRows(mode); touch(mode); });
    }
  });
  document.querySelector(`[data-add="${mode}"]`).addEventListener('click', () => addRow(mode, true));
  $(mode + '-save').addEventListener('click', () => saveSheet(mode));
  $(mode + '-copy').addEventListener('click', () => {
    const prev = prevOf(mode); if (!prev) return;
    SH[mode].rows = (prev.extras || []).map(x => ({ name: x.name || '', qty: '' }));
    renderRows(mode); touch(mode);
    toast(mode === 'order' ? 'انسخت الأسماء، اكتبي الكميات المطلوبة' : 'انسخت الأسماء، اكتبي المتبقي من كل صنف');
  });
});
$('photoInput').addEventListener('change', async () => {
  const file = $('photoInput').files[0], t = camTarget; camTarget = null;
  if (!file || !t) return;
  t.row.uploading = true; renderRows(t.mode);
  try {
    const data = await resizeImage(file);
    const id = await api('app_add_photo', { p_token: tok(), p_data: data });
    PHOTOS[id] = data; t.row.photo = id;
    toast('انضافت الصورة');
  } catch (err) { toast(errMsg(err)); }
  finally { delete t.row.uploading; renderRows(t.mode); touch(t.mode); }
});
$('order-notes').addEventListener('input', () => { SH.order.notes = $('order-notes').value; touch('order'); });
async function saveSheet(mode) {
  const st = SH[mode], btn = $(mode + '-save');
  if (st.rows.some(r => r.uploading)) { toast('انتظري لين تخلص الصورة'); return; }
  const rows = named(st.rows).map(r => { const o = { name: r.name.trim(), qty: String(r.qty || '').trim() }; if (r.photo) o.photo = r.photo; return o; });
  if (!rows.length) { toast('اكتبي صنف واحد على الأقل'); return; }
  const missingQty = rows.filter(r => !r.qty).length;
  if (missingQty && btn.dataset.sure !== '1') {
    btn.dataset.sure = '1'; btn.textContent = `${missingQty} صنف بدون كمية، إرسال؟`;
    setTimeout(() => { delete btn.dataset.sure; renderSheetMeta(mode); }, 4000);
    return;
  }
  delete btn.dataset.sure;
  btn.disabled = true;
  try {
    const doc = mode === 'order'
      ? await api('app_save_order', { p_token: tok(), p_day: S.date, p_items: {}, p_extras: rows, p_notes: st.notes })
      : await api('app_save_stock_rows', { p_token: tok(), p_day: S.date, p_rows: rows });
    if (S.data) S.data[mode] = doc;
    store.set(draftKey(mode, st.key), null);
    st.dirty = false; syncSheet(mode);
    toast(mode === 'order' ? 'انرسلت النواقص للإدارة ✓' : 'انحفظ الجرد ✓');
  } catch (err) { toast(errMsg(err)); }
  finally { btn.disabled = false; }
}

// ---------------------------------------------------------------- admin: overview
function renderOverview() {
  const d = S.data || {};
  $('adminDate').textContent = dateLabel(S.date);
  const by = (arr) => { const m = {}; (arr || []).forEach(x => { m[x.branch_id] = x; }); return m; };
  const reps = by(d.reports), chk = by(d.checklists), ords = by(d.orders), stk = by(d.stocks);
  const f = { cash: 0, card: 0 }; let sent = 0;
  $('adminRows').innerHTML = S.branches.map(b => {
    const r = reps[b.id], c = chk[b.id], o = ords[b.id], k = stk[b.id], cnt = c ? countDone(c.done || {}) : 0;
    if (r) { sent++; f.cash += num(r.cash); f.card += num(r.card); }
    return `<tr><td>${esc(b.name)}</td>` + (r
      ? `<td class="num">${money(r.cash)}</td><td class="num">${money(r.card)}</td><td class="num"><b>${money(num(r.cash) + num(r.card))}</b></td>`
      : `<td colspan="3">${pill('idle', 'لم يُرسل التقرير')}</td>`) +
      `<td>${pill('num ' + (cnt >= TASK_COUNT ? 'ok' : cnt ? 'warn' : 'idle'), cnt + '/' + TASK_COUNT)}</td>` +
      `<td>${o ? pill('ok', o.item_count + ' صنف') : pill('idle', '—')}</td>` +
      `<td>${k ? pill('ok', 'تم') : pill('idle', '—')}</td>` +
      `<td>${esc((r && r.staff) || (o && o.staff) || (c && c.staff) || '—')}</td></tr>`;
  }).join('');
  $('f-cash').textContent = money(f.cash); $('f-card').textContent = money(f.card); $('f-total').textContent = money(f.cash + f.card);
  $('a-total').textContent = money(f.cash + f.card) + ' ر.س';
  $('a-reports').textContent = `${sent} / ${S.branches.length}`;
  $('a-orders').textContent = `${(d.orders || []).length} / ${S.branches.length}`;
  const notes = S.branches.map(b => reps[b.id]).filter(r => r && (r.notes || r.best));
  $('notesPanel').hidden = !notes.length;
  $('adminNotes').innerHTML = notes.map(r => `<li class="req"><span class="item">${esc(branchName(r.branch_id))}</span><span class="small muted">${esc(r.staff || '')}</span>` +
    `<span class="body">${r.best ? 'الأكثر مبيعاً: ' + esc(r.best) + (r.notes ? '\n' : '') : ''}${esc(r.notes || '')}</span></li>`).join('');
}

// ---------------------------------------------------------------- admin: shortages & stock
const ADM = { order: { docs: 'orders', body: 'ao-body', status: 'ao-status', date: 'ao-date', sent: 'أرسلوا', qty: 'المطلوب', empty: 'ما وصلت نواقص لهذا اليوم', file: 'shortages' },
              stock: { docs: 'stocks', body: 'as-body', status: 'as-status', date: 'as-date', sent: 'سجّلوا الجرد', qty: 'المتبقي', empty: 'ما فيه جرد مسجل لهذا اليوم', file: 'stock' } };
const docsOf = mode => ((S.data && S.data[ADM[mode].docs]) || []).slice().sort((a, b) => S.branches.findIndex(x => x.id === a.branch_id) - S.branches.findIndex(x => x.id === b.branch_id));
// one row per item name across all branches
function aggregate(docs) {
  const groups = [], idx = {};
  docs.forEach(d => (d.extras || []).forEach(x => {
    const k = norm(x.name); if (!k) return;
    if (!(k in idx)) { idx[k] = groups.length; groups.push({ name: x.name, entries: [] }); }
    groups[idx[k]].entries.push({ branch: d.branch_id, qty: x.qty || '', photo: x.photo });
  }));
  return groups;
}
const thumbs = photos => photos.length ? `<span class="thumbs">${photos.map(id => `<button type="button" class="mini-btn" data-open-photo="${esc(id)}" aria-label="عرض الصورة">${photoImg(id, 'mini')}</button>`).join('')}</span>` : '';
function renderAdminRows(mode) {
  const A = ADM[mode], docs = docsOf(mode), have = {};
  docs.forEach(d => { have[d.branch_id] = true; });
  $(A.date).textContent = dateLabel(S.date);
  $(A.status).innerHTML = `<span class="pill ${docs.length === S.branches.length ? 'ok' : 'warn'} num">${docs.length} من ${S.branches.length} ${A.sent}</span>` +
    S.branches.map(b => have[b.id] ? pill('ok', '✓ ' + shortBranch(b)) : pill('idle', shortBranch(b))).join('');
  const body = $(A.body);
  if (!docs.length) { body.innerHTML = `<div class="empty">${A.empty}</div>`; return; }
  const short = id => { const b = S.branches.find(x => x.id === id); return b ? shortBranch(b) : id; };
  if (S.aview[mode] === 'total') {
    const groups = aggregate(docs);
    body.innerHTML = `<div class="table-wrap"><table class="sheet-table"><thead><tr><th>الصنف</th><th>المجموع</th><th>تفصيل الفروع</th></tr></thead><tbody>` +
      groups.map(g => `<tr><td class="wrap"><span class="agg-name"><span>${esc(g.name)}</span>${thumbs(g.entries.map(e => e.photo).filter(Boolean))}</span></td>` +
        `<td class="sum">${esc(sumQty(g.entries.map(e => e.qty)) || '—')}</td>` +
        `<td class="agg-detail">${g.entries.map(e => esc(short(e.branch)) + ': ' + esc(e.qty || '—')).join(' · ')}</td></tr>`).join('') +
      '</tbody></table></div>';
  } else {
    body.innerHTML = docs.map(d => `<div class="branch-card">
        <h3><span>${esc(branchName(d.branch_id))}</span><span class="small muted">${esc(d.staff || '')} · ${esc(timeLabel(d.updated_at))}</span></h3>
        <ul>${(d.extras || []).map(x => `<li><span class="agg-name"><span>${esc(x.name)}</span>${thumbs(x.photo ? [x.photo] : [])}</span><span class="q">${esc(x.qty || '—')}</span></li>`).join('')}</ul>
        ${d.notes ? `<p class="note m0">ملاحظة: ${esc(d.notes)}</p>` : ''}</div>`).join('');
  }
  fetchPhotos(docs.flatMap(d => (d.extras || []).map(x => x.photo)));
}
document.querySelectorAll('[data-aview]').forEach(b => b.addEventListener('click', () => {
  const [mode, v] = b.dataset.aview.split(':');
  S.aview[mode] = v;
  document.querySelectorAll(`[data-aview^="${mode}:"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  renderAdminRows(mode);
}));
document.querySelectorAll('[data-csv]').forEach(b => b.addEventListener('click', () => {
  const mode = b.dataset.csv, A = ADM[mode], docs = docsOf(mode);
  if (!docs.length) { toast(A.empty); return; }
  const rows = [['الصنف', 'المجموع', 'تفصيل الفروع']];
  aggregate(docs).forEach(g => rows.push([g.name, sumQty(g.entries.map(e => e.qty)), g.entries.map(e => branchName(e.branch) + ': ' + (e.qty || '—')).join(' · ')]));
  rows.push([]); rows.push(['الفرع', 'الصنف', A.qty]);
  docs.forEach(d => (d.extras || []).forEach(x => rows.push([branchName(d.branch_id), x.name, x.qty])));
  const notes = docs.filter(d => d.notes);
  if (notes.length) { rows.push([]); rows.push(['الفرع', 'ملاحظات']); notes.forEach(d => rows.push([branchName(d.branch_id), d.notes])); }
  downloadCSV(A.file + '-' + S.date, rows);
}));

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
  let tot = 0, top = null;
  $('periodRows').innerHTML = data.branches.map(b => {
    const t = num(b.cash) + num(b.card); tot += t;
    if (t > 0 && (!top || t > top.t)) top = { id: b.branch_id, t };
    return `<tr><td>${esc(branchName(b.branch_id))}</td><td class="num">${b.days}</td><td class="num">${money(b.cash)}</td><td class="num">${money(b.card)}</td>` +
      `<td class="num"><b>${money(t)}</b></td><td class="num">${b.days ? money(t / b.days) : '—'}</td></tr>`;
  }).join('');
  const days = data.days || [];
  $('p-total').textContent = money(tot) + ' ر.س';
  $('p-avg').textContent = days.length ? money(tot / days.length) : '0';
  $('p-top').textContent = top ? branchName(top.id) : '—';
  const max = Math.max(1, ...days.map(d => num(d.total)));
  $('dayBars').innerHTML = days.length ? days.map(d =>
    `<li><span>${esc(shortDate(d.day))}</span><span class="track"><i style="width:${(num(d.total) / max * 100).toFixed(1)}%"></i></span><b>${money(d.total)}</b></li>`).join('')
    : '<li class="empty">ما فيه تقارير في هذي الفترة</li>';
}
$('exportBtn').addEventListener('click', () => {
  if (!S.period) return;
  const rows = [['الفرع', 'أيام التقارير', 'كاش', 'شبكة', 'الإجمالي']];
  S.period.data.branches.forEach(b => rows.push([branchName(b.branch_id), b.days, num(b.cash), num(b.card), num(b.cash) + num(b.card)]));
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

// ---------------------------------------------------------------- boot
checkVersion();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
if (!CFG.SUPABASE_URL || !CFG.SUPABASE_KEY) show('setup');
else if (S.sess && S.sess.token) { show('app'); loadStatus().catch(() => {}).finally(startApp); }
else showLogin();
})();
