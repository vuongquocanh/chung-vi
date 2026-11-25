'use strict';
/* =========================================================
   Chung Ví — Quản lý chi tiêu cá nhân & cặp đôi sắp cưới
   Dữ liệu lưu trong localStorage của trình duyệt.
   ========================================================= */

const KEY = 'chungvi-data-v1';

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toISO(new Date());
const curMonth = () => today().slice(0, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('vi-VN');
const money = n => nf.format(Math.round(n || 0)) + ' ₫';
const trim1 = x => (Math.round(x * 10) / 10).toString().replace('.', ',');
const short = n => {
  const a = Math.abs(n || 0), s = n < 0 ? '-' : '';
  if (a >= 1e9) return s + trim1(a / 1e9) + ' tỷ';
  if (a >= 1e6) return s + trim1(a / 1e6) + ' tr';
  if (a >= 1e3) return s + trim1(a / 1e3) + 'k';
  return s + a;
};
const sum = (arr, f = x => x.amount) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const monthLabel = m => { const [y, mm] = m.split('-'); return `Tháng ${+mm}/${y}`; };
const shiftMonth = (m, k) => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const addDays = (iso, k) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + k); return toISO(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** "150k", "1,5tr", "2 triệu", "1.200.000", "1 tỷ" → số */
function parseMoney(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return 0;
  let mult = 1;
  const units = [[/(tỷ|ty|b)$/, 1e9], [/(triệu|trieu|tr|m)$/, 1e6], [/(nghìn|ngàn|ngan|k)$/, 1e3]];
  for (const [re, m] of units) if (re.test(s)) { mult = m; s = s.replace(re, ''); break; }
  if (mult > 1) return Math.round((parseFloat(s.replace(',', '.')) || 0) * mult);
  const neg = s.startsWith('-');
  const n = parseInt(s.replace(/[^\d]/g, ''), 10) || 0;
  return neg ? -n : n;
}

/* ---------- Defaults ---------- */
const PALETTE = ['#e2557a', '#5b6cff', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#22c55e', '#ec4899', '#64748b', '#a16207', '#06b6d4'];

const DEFAULT_CATS = [
  ['Ăn uống', '🍜', 'expense'], ['Đi lại', '🛵', 'expense'], ['Nhà ở', '🏠', 'expense'], ['Hóa đơn', '⚡', 'expense'],
  ['Mua sắm', '🛍️', 'expense'], ['Giải trí', '🎬', 'expense'], ['Sức khỏe', '💊', 'expense'], ['Học tập', '📚', 'expense'],
  ['Hiếu hỷ', '🎁', 'expense'], ['Hẹn hò', '💕', 'expense'], ['Khác', '📦', 'expense'],
  ['Lương', '💼', 'income'], ['Thưởng', '🎉', 'income'], ['Kinh doanh', '📈', 'income'], ['Thu khác', '💰', 'income'],
].map(([name, icon, type], i) => ({ id: 'c' + i, name, icon, type, color: PALETTE[i % PALETTE.length], budget: 0 }));

const WEDDING_GROUPS = ['Lễ dạm ngõ', 'Lễ ăn hỏi', 'Nhẫn & trang sức', 'Trang phục & làm đẹp', 'Ảnh & quay phim', 'Tiệc cưới', 'Lễ cưới', 'Trang trí', 'Tuần trăng mật', 'Khác'];

const DEFAULT_ITEMS = [
  ['Lễ dạm ngõ', 'Lễ vật dạm ngõ', 3e6], ['Lễ ăn hỏi', 'Tráp ăn hỏi (mâm quả)', 15e6], ['Lễ ăn hỏi', 'Đội bê tráp', 3e6],
  ['Nhẫn & trang sức', 'Nhẫn cưới', 15e6], ['Nhẫn & trang sức', 'Trang sức cô dâu', 20e6],
  ['Trang phục & làm đẹp', 'Váy cưới & vest', 15e6], ['Trang phục & làm đẹp', 'Áo dài lễ hỏi', 5e6], ['Trang phục & làm đẹp', 'Trang điểm & làm tóc', 6e6],
  ['Ảnh & quay phim', 'Chụp ảnh cưới (pre-wedding)', 20e6], ['Ảnh & quay phim', 'Quay & chụp phóng sự ngày cưới', 12e6],
  ['Tiệc cưới', 'Tiệc nhà hàng', 150e6], ['Lễ cưới', 'Thiệp cưới', 3e6], ['Lễ cưới', 'Xe hoa', 4e6], ['Lễ cưới', 'MC & âm nhạc', 6e6],
  ['Trang trí', 'Hoa cưới & trang trí', 10e6], ['Trang trí', 'Bánh cưới, rượu & champagne', 3e6],
  ['Tuần trăng mật', 'Tuần trăng mật', 30e6], ['Khác', 'Quà cảm ơn', 3e6], ['Khác', 'Chi phí phát sinh', 10e6],
].map(([group, name, estimate]) => ({ id: uid(), group, name, estimate, actual: 0, paid: 0, vendor: '', payer: 'both', note: '' }));

/* [số ngày trước ngày cưới, việc cần làm] — số âm là sau ngày cưới */
const TASK_TEMPLATE = [
  [365, 'Thống nhất ngân sách & ngày cưới'], [330, 'Ra mắt, gặp gỡ hai bên gia đình'], [300, 'Lên danh sách khách mời sơ bộ'],
  [270, 'Khảo sát & đặt cọc nhà hàng tiệc cưới'], [240, 'Chọn studio chụp ảnh cưới'], [180, 'Chụp ảnh pre-wedding'],
  [150, 'Đặt may áo dài, thuê váy cưới / vest'], [120, 'Chọn & đặt nhẫn cưới'], [100, 'Tổ chức lễ dạm ngõ'],
  [90, 'Đặt in thiệp cưới'], [90, 'Book trang điểm, xe hoa, MC & âm nhạc'], [60, 'Lễ ăn hỏi'], [45, 'Phát thiệp mời'],
  [30, 'Đăng ký kết hôn'], [21, 'Chốt số lượng khách với nhà hàng'], [7, 'Thử váy lần cuối, chuẩn bị phong bì & quà cảm ơn'],
  [1, 'Tổng duyệt lễ cưới'], [-7, 'Tổng kết tiền mừng & gửi lời cảm ơn khách'],
];

function defaultState() {
  return {
    version: 1,
    settings: { mode: 'couple', name1: 'Anh', name2: 'Em', theme: 'auto', onboarded: false },
    categories: DEFAULT_CATS.map(c => ({ ...c })),
    transactions: [],
    goals: [],
    wedding: { date: '', budget: 0, perTable: 10, costPerTable: 6e6, items: DEFAULT_ITEMS.map(i => ({ ...i, id: uid() })), tasks: [], guests: [] },
    // ui: chỉ lưu trên thiết bị này, không đồng bộ. me = người dùng thiết bị này là p1 hay p2.
    ui: { view: 'dashboard', month: curMonth(), wtab: 'overview', filter: { q: '', type: '', cat: '', person: '', all: false }, guestSide: '', me: 'p1', cloudUid: null, unsynced: false },
  };
}

/* ---------- State ---------- */
const SYNC_KEYS = ['settings', 'categories', 'goals', 'wedding', 'transactions'];
let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw), def = defaultState();
      return normalize(d, def);
    }
  } catch (e) { console.warn('Không đọc được dữ liệu', e); }
  return defaultState();
}
function normalize(d, def = defaultState()) {
  const ui = { ...def.ui, ...(d.ui || {}), filter: { ...def.ui.filter, ...((d.ui && d.ui.filter) || {}) }, month: curMonth() };
  return {
    ...def, ...d,
    settings: { ...def.settings, ...(d.settings || {}) },
    categories: Array.isArray(d.categories) && d.categories.length ? d.categories : def.categories,
    transactions: Array.isArray(d.transactions) ? d.transactions : [],
    goals: Array.isArray(d.goals) ? d.goals : [],
    wedding: { ...def.wedding, ...(d.wedding || {}) },
    ui,
  };
}
/** Lưu vào máy; nếu đã đăng nhập đám mây thì đẩy thay đổi lên. silent = chỉ lưu máy (dùng khi nhận dữ liệu từ đám mây). */
const dataSig = () => JSON.stringify(SYNC_KEYS.map(k => S[k]));
let lastDataSig = dataSig();
function save(silent = false) {
  const cloud = window.chungviCloud;
  const sig = dataSig(), dataChanged = sig !== lastDataSig;
  lastDataSig = sig;
  if (!silent && dataChanged) { // chỉ dữ liệu thật (không tính chuyển trang, bộ lọc…)
    if (cloud && cloud.isReady()) cloud.push();
    else if (S.ui.cloudUid) S.ui.unsynced = true; // sửa khi chưa kết nối được — sẽ đẩy lên khi có mạng
  }
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ Không lưu được dữ liệu (bộ nhớ trình duyệt bị chặn?)'); }
}

/* API cho module đồng bộ đám mây (js/cloud.js) */
let pendingRender = false;
function safeRender() {
  const a = document.activeElement;
  if (a && a.closest && a.closest('#view') && a.matches('input, select, textarea')) {
    if (!pendingRender) { pendingRender = true; a.addEventListener('blur', () => { pendingRender = false; render(); }, { once: true }); }
    return;
  }
  render();
}
window.chungvi = {
  get state() { return S; },
  /** Áp dữ liệu từ đám mây vào máy (không đẩy ngược lên). */
  applyRemote(patch) {
    SYNC_KEYS.forEach(k => {
      if (!(k in patch)) return;
      if (k === 'settings') S.settings = { ...S.settings, ...patch.settings, theme: S.settings.theme, onboarded: true };
      else if (k === 'wedding') S.wedding = { ...defaultState().wedding, ...patch.wedding };
      else S[k] = patch[k];
    });
    save(true); safeRender();
  },
  setUi(obj) { Object.assign(S.ui, obj); save(true); },
  render: () => safeRender(),
  toast: msg => toast(msg),
};

const isCouple = () => S.settings.mode === 'couple';
const P = k => ({ p1: S.settings.name1, p2: S.settings.name2, both: 'Quỹ chung', f1: `Gia đình ${S.settings.name1}`, f2: `Gia đình ${S.settings.name2}` }[k] || '—');
const catById = id => S.categories.find(c => c.id === id) || { name: 'Không rõ', icon: '❔', color: '#94a3b8', type: 'expense' };
const txOfMonth = m => S.transactions.filter(t => t.date && t.date.startsWith(m));
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/* ---------- UI utilities ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

let modalSubmit = null;
function openModal({ title, body, submitText = 'Lưu', onSubmit, onOpen }) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalSubmit').textContent = submitText;
  modalSubmit = onSubmit;
  const dlg = $('#modal');
  if (!dlg.open) dlg.showModal();
  if (onOpen) onOpen($('#modalForm'));
  const first = $('#modalBody input:not([type=radio]):not([type=checkbox]), #modalBody select, #modalBody textarea');
  if (first) setTimeout(() => first.focus(), 30);
}
function closeModal() { $('#modal').close(); modalSubmit = null; }
$('#modalForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!modalSubmit) return closeModal();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  $$('input[type=checkbox]', form).forEach(c => { if (c.name) data[c.name] = c.checked; });
  if (modalSubmit(data, form) !== false) { closeModal(); save(); render(); }
});

const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(label)}</option>`;
const personOptions = (sel, withFamily = false, withBoth = false) =>
  (withBoth ? opt('both', P('both'), sel) : '') + opt('p1', P('p1'), sel) + opt('p2', P('p2'), sel) +
  (withFamily ? opt('f1', P('f1'), sel) + opt('f2', P('f2'), sel) : '');

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Charts ---------- */
const charts = {};
function destroyCharts() { Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; }); }
function mkChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) { if (el) el.parentElement.innerHTML = '<div class="empty small">Không tải được thư viện biểu đồ.</div>'; return; }
  Chart.defaults.color = cssVar('--muted');
  Chart.defaults.borderColor = cssVar('--border');
  Chart.defaults.font.family = '"Be Vietnam Pro", system-ui, sans-serif';
  charts[id] = new Chart(el, cfg);
}
const doughnutCfg = (labels, data, colors) => ({
  type: 'doughnut',
  data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: cssVar('--surface'), borderWidth: 3 }] },
  options: {
    maintainAspectRatio: false, cutout: '62%',
    plugins: {
      legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: { callbacks: { label: c => ` ${c.label}: ${money(c.raw)}` } },
    },
  },
});

/* =========================================================
   VIEWS
   ========================================================= */
const VIEWS = {
  dashboard: { title: 'Tổng quan', month: true, render: viewDashboard },
  transactions: { title: 'Giao dịch', month: true, render: viewTransactions },
  budget: { title: 'Ngân sách tháng', month: true, render: viewBudget },
  goals: { title: 'Mục tiêu tiết kiệm', month: false, render: viewGoals },
  wedding: { title: 'Kế hoạch đám cưới', month: false, render: viewWedding },
  settings: { title: 'Cài đặt', month: false, render: viewSettings },
};

function render() {
  applyTheme();
  if (!isCouple() && S.ui.view === 'wedding') S.ui.view = 'dashboard';
  const v = VIEWS[S.ui.view] || VIEWS.dashboard;
  destroyCharts();
  $('#viewTitle').textContent = v.title;
  $('#viewSub').textContent = isCouple() ? `${S.settings.name1} & ${S.settings.name2}` : `Sổ chi tiêu của ${S.settings.name1}`;
  $('#brandSub').textContent = isCouple() ? 'Sổ chi tiêu đôi ta' : 'Sổ chi tiêu cá nhân';
  $('#monthSwitch').classList.toggle('hidden', !v.month);
  $('#monthLabel').textContent = monthLabel(S.ui.month);
  $('#navWedding').classList.toggle('hidden', !isCouple());
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === S.ui.view));
  $('#sidebarFoot').innerHTML = sidebarFoot();
  $('#view').innerHTML = v.render();
  while (afterRender.length) afterRender.shift()();
  if (window.chungviCloud) window.chungviCloud.renderCard();
  else if ($('#cloudCard')) $('#cloudCard').innerHTML = '<div class="muted small">Đang tải mô-đun đồng bộ…</div>';
}
const afterRender = [];

function sidebarFoot() {
  if (!isCouple() || !S.wedding.date) return '';
  const d = daysBetween(today(), S.wedding.date);
  const label = d > 0 ? `Còn <b>${d}</b> ngày nữa` : d === 0 ? '<b>Hôm nay là ngày cưới!</b>' : `Đã cưới được <b>${-d}</b> ngày`;
  return `<div class="card" style="padding:14px;text-align:center"><div style="font-size:22px">💒</div><div class="small">${label}</div><div class="tiny muted">${fmtDate(S.wedding.date)}</div></div>`;
}

function kpi(label, value, icon, tone, sub = '') {
  return `<div class="card kpi"><div class="kpi-top"><span>${label}</span><span class="kpi-ic t-${tone}">${icon}</span></div>
    <div class="kpi-val">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
}

function txRow(t) {
  const c = catById(t.categoryId), inc = t.type === 'income';
  const meta = [fmtDate(t.date), esc(c.name)];
  if (isCouple()) meta.push(esc(P(t.person)));
  return `<div class="tx">
    <div class="tx-ic" style="background:${c.color}22">${c.icon}</div>
    <div class="tx-main"><div class="tx-title">${esc(t.note || c.name)}</div>
      <div class="tx-meta">${meta.join(' · ')}${isCouple() && t.shared ? ' <span class="badge rose">Chia đôi</span>' : ''}</div></div>
    <div class="tx-amt ${inc ? 'pos' : ''}">${inc ? '+' : '−'}${money(t.amount)}</div>
    <div class="tx-actions"><button class="icon-btn" data-action="edit-tx" data-id="${t.id}" aria-label="Sửa">✏️</button>
    <button class="icon-btn" data-action="del-tx" data-id="${t.id}" aria-label="Xóa">🗑️</button></div></div>`;
}

/* ---------- Dashboard ---------- */
function viewDashboard() {
  const m = S.ui.month, tx = txOfMonth(m), prev = txOfMonth(shiftMonth(m, -1));
  const exps = tx.filter(t => t.type === 'expense');
  const inc = sum(tx.filter(t => t.type === 'income')), exp = sum(exps);
  const pexp = sum(prev.filter(t => t.type === 'expense'));
  const bal = inc - exp, rate = inc ? Math.round((bal / inc) * 100) : 0;
  const delta = pexp ? Math.round(((exp - pexp) / pexp) * 100) : null;
  const totalBudget = sum(S.categories.filter(c => c.type === 'expense'), c => c.budget);
  let h = '';

  if (!S.transactions.length) {
    h += `<div class="hero"><div><h2>Chào mừng đến với Chung Ví 👋</h2>
      <div class="muted">Bắt đầu bằng cách thêm giao dịch đầu tiên, hoặc tải dữ liệu mẫu để xem thử.</div></div>
      <div class="btn-row"><button class="btn primary" data-action="add-tx">＋ Thêm giao dịch</button>
      <button class="btn" data-action="load-sample">Tải dữ liệu mẫu</button></div></div>`;
  }

  if (isCouple() && S.wedding.date) h += weddingBanner();

  h += `<div class="grid kpis">
    ${kpi('Thu nhập', money(inc), '💰', 'green')}
    ${kpi('Chi tiêu', money(exp), '💸', 'red', delta === null ? 'Chưa có dữ liệu tháng trước' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% so với tháng trước`)}
    ${kpi('Còn lại', `<span class="${bal < 0 ? 'neg' : ''}">${money(bal)}</span>`, '🏦', 'blue')}
    ${kpi('Tỷ lệ tiết kiệm', rate + '%', '🎯', 'purple', totalBudget ? `Đã dùng ${pct(exp, totalBudget)}% ngân sách (${short(totalBudget)})` : 'Chưa đặt ngân sách')}
  </div>`;

  if (isCouple()) h += coupleCard(tx);

  // category breakdown
  const byCat = {};
  exps.forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; });
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  h += `<div class="grid grid-2">
    <div class="card"><div class="card-head"><h3>Thu chi 6 tháng gần nhất</h3></div><div class="chart-box"><canvas id="chTrend"></canvas></div></div>
    <div class="card"><div class="card-head"><h3>Chi tiêu theo danh mục</h3><span class="muted small">${monthLabel(m)}</span></div>
      ${catRows.length ? '<div class="chart-box sm"><canvas id="chCat"></canvas></div>' : '<div class="empty"><div class="big">🍃</div>Chưa có khoản chi nào trong tháng</div>'}
    </div></div>`;

  const recent = [...S.transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0)).slice(0, 6);
  h += `<div class="grid grid-2">
    <div class="card"><div class="card-head"><h3>Giao dịch gần đây</h3><button class="btn sm ghost" data-view-link="transactions">Xem tất cả →</button></div>
      ${recent.length ? recent.map(txRow).join('') : '<div class="empty small">Chưa có giao dịch</div>'}</div>
    <div class="card"><div class="card-head"><h3>Top danh mục chi</h3></div>
      ${catRows.length ? catRows.slice(0, 6).map(([id, v]) => {
        const c = catById(id), b = c.budget || 0;
        return `<div class="list-row"><span class="tx-ic" style="width:34px;height:34px;font-size:16px;background:${c.color}22">${c.icon}</span>
          <div style="flex:1;min-width:0"><div class="small" style="display:flex;justify-content:space-between;gap:8px"><b>${esc(c.name)}</b><span class="num">${money(v)}</span></div>
          <div class="progress" style="margin-top:6px"><span class="${b && v > b ? 'over' : ''}" style="width:${clamp(b ? pct(v, b) : pct(v, exp), 2, 100)}%;background:${b && v > b ? '' : c.color}"></span></div>
          <div class="tiny muted">${b ? `${pct(v, b)}% ngân sách ${short(b)}` : `${pct(v, exp)}% tổng chi`}</div></div></div>`;
      }).join('') : '<div class="empty small">Chưa có dữ liệu</div>'}</div></div>`;

  afterRender.push(() => {
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(m, i - 5));
    mkChart('chTrend', {
      type: 'bar',
      data: {
        labels: months.map(x => 'T' + +x.slice(5) + '/' + x.slice(2, 4)),
        datasets: [
          { label: 'Thu', data: months.map(x => sum(txOfMonth(x).filter(t => t.type === 'income'))), backgroundColor: cssVar('--green'), borderRadius: 6, maxBarThickness: 26 },
          { label: 'Chi', data: months.map(x => sum(txOfMonth(x).filter(t => t.type === 'expense'))), backgroundColor: cssVar('--primary'), borderRadius: 6, maxBarThickness: 26 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${money(c.raw)}` } } },
        scales: { y: { ticks: { callback: v => short(v) }, grid: { color: cssVar('--border') } }, x: { grid: { display: false } } },
      },
    });
    if (catRows.length) mkChart('chCat', doughnutCfg(catRows.map(([id]) => catById(id).name), catRows.map(r => r[1]), catRows.map(([id]) => catById(id).color)));
  });
  return h;
}

function weddingBanner() {
  const W = S.wedding, d = daysBetween(today(), W.date);
  const cost = sum(W.items, i => i.actual || i.estimate);
  const tasksDone = W.tasks.filter(t => t.done).length;
  return `<div class="hero"><div><h2>💒 ${esc(S.settings.name1)} & ${esc(S.settings.name2)}</h2>
    <div class="muted small">Ngày cưới ${fmtDate(W.date)} · Chi phí dự kiến ${short(cost)}${W.budget ? ` / ngân sách ${short(W.budget)}` : ''} · Công việc ${tasksDone}/${W.tasks.length}</div></div>
    <div class="countdown">${d >= 0
      ? `<div class="cd-box"><b>${d}</b><span>ngày nữa</span></div><div class="cd-box"><b>${Math.floor(d / 7)}</b><span>tuần</span></div>`
      : `<div class="cd-box"><b>${-d}</b><span>ngày bên nhau</span></div>`}
    <button class="btn" data-view-link="wedding" style="align-self:center">Mở kế hoạch →</button></div></div>`;
}

function coupleCard(tx) {
  const exps = tx.filter(t => t.type === 'expense');
  const e1 = sum(exps.filter(t => t.person === 'p1')), e2 = sum(exps.filter(t => t.person === 'p2'));
  const shared = exps.filter(t => t.shared);
  const s1 = sum(shared.filter(t => t.person === 'p1')), s2 = sum(shared.filter(t => t.person === 'p2'));
  const diff = (s1 - s2) / 2;
  const settle = !shared.length ? 'Chưa có khoản chi chung (chia đôi) trong tháng.'
    : Math.abs(diff) < 1000 ? '✅ Hai bạn đang chia đều chi tiêu chung. Tuyệt vời!'
    : diff > 0 ? `💸 <b>${esc(P('p2'))}</b> cần chuyển cho <b>${esc(P('p1'))}</b> <b class="num">${money(diff)}</b>`
    : `💸 <b>${esc(P('p1'))}</b> cần chuyển cho <b>${esc(P('p2'))}</b> <b class="num">${money(-diff)}</b>`;
  const tot = e1 + e2 || 1;
  return `<div class="card"><div class="card-head"><h3>👫 Chi tiêu của hai bạn</h3><span class="muted small">Chi chung: ${money(s1 + s2)}</span></div>
    <div class="grid grid-2e">
      <div><div class="stack"><span style="width:${(e1 / tot) * 100}%;background:${PALETTE[1]}"></span><span style="width:${(e2 / tot) * 100}%;background:${PALETTE[0]}"></span></div>
        <div class="legend"><span><i class="dot" style="background:${PALETTE[1]}"></i>${esc(P('p1'))}: <b class="num">${money(e1)}</b></span>
        <span><i class="dot" style="background:${PALETTE[0]}"></i>${esc(P('p2'))}: <b class="num">${money(e2)}</b></span></div></div>
      <div class="small" style="background:var(--surface-2);border-radius:12px;padding:12px 14px">
        <div class="lbl" style="margin-bottom:4px">Cân đối chi tiêu chung tháng này</div>${settle}</div>
    </div></div>`;
}

/* ---------- Transactions ---------- */
function filteredTx() {
  const f = S.ui.filter, q = f.q.trim().toLowerCase();
  return S.transactions.filter(t => {
    if (!f.all && !t.date.startsWith(S.ui.month)) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.cat && t.categoryId !== f.cat) return false;
    if (f.person === 'shared' ? !t.shared : f.person && t.person !== f.person) return false;
    if (q && !(`${t.note} ${catById(t.categoryId).name}`.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
}

function viewTransactions() {
  const f = S.ui.filter;
  return `<div class="card">
    <div class="filters">
      <input class="input" type="search" placeholder="🔎 Tìm theo ghi chú, danh mục…" data-filter="q" value="${esc(f.q)}">
      <select class="input" data-filter="type">${opt('', 'Thu & chi', f.type)}${opt('expense', 'Chỉ khoản chi', f.type)}${opt('income', 'Chỉ khoản thu', f.type)}</select>
      <select class="input" data-filter="cat">${opt('', 'Mọi danh mục', f.cat)}${S.categories.map(c => opt(c.id, `${c.icon} ${c.name}`, f.cat)).join('')}</select>
      ${isCouple() ? `<select class="input" data-filter="person">${opt('', 'Cả hai người', f.person)}${opt('p1', P('p1'), f.person)}${opt('p2', P('p2'), f.person)}${opt('shared', 'Chỉ khoản chia đôi', f.person)}</select>` : ''}
      <label class="check"><input type="checkbox" data-filter="all" ${f.all ? 'checked' : ''}> Mọi tháng</label>
      <button class="btn sm" data-action="export-csv">⬇ Xuất CSV</button>
    </div></div>
    <div class="card" id="txList">${txListHTML()}</div>`;
}

function txListHTML() {
  const list = filteredTx();
  if (!list.length) return '<div class="empty"><div class="big">🧾</div>Không có giao dịch phù hợp</div>';
  const inc = sum(list.filter(t => t.type === 'income')), exp = sum(list.filter(t => t.type === 'expense'));
  const groups = {};
  list.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
  return `<div class="stat-pills" style="margin-bottom:8px">
      <div class="stat-pill"><b>${list.length}</b><span>giao dịch</span></div>
      <div class="stat-pill"><b class="pos num">+${money(inc)}</b><span>tổng thu</span></div>
      <div class="stat-pill"><b class="neg num">−${money(exp)}</b><span>tổng chi</span></div></div>` +
    Object.entries(groups).map(([d, ts]) => {
      const net = sum(ts, t => (t.type === 'income' ? t.amount : -t.amount));
      return `<div class="tx-group-head"><span>${fmtDate(d)}</span><span class="num">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</span></div>${ts.map(txRow).join('')}`;
    }).join('');
}

function txModal(t) {
  const editing = !!t;
  t = t || { type: 'expense', amount: '', categoryId: '', date: S.ui.month === curMonth() ? today() : S.ui.month + '-01', note: '', person: S.ui.me || 'p1', shared: false };
  const catOpts = type => S.categories.filter(c => c.type === type).map(c => opt(c.id, `${c.icon} ${c.name}`, t.categoryId)).join('');
  openModal({
    title: editing ? 'Sửa giao dịch' : 'Thêm giao dịch',
    body: `<div class="seg"><label><input type="radio" name="type" value="expense" ${t.type === 'expense' ? 'checked' : ''}><span>💸 Khoản chi</span></label>
        <label><input type="radio" name="type" value="income" ${t.type === 'income' ? 'checked' : ''}><span>💰 Khoản thu</span></label></div>
      <div class="form-grid">
        <div class="field full"><label>Số tiền</label><input class="input" name="amount" inputmode="decimal" autocomplete="off" required placeholder="VD: 45000, 150k, 1,5tr" value="${t.amount ? nf.format(t.amount) : ''}">
          <span class="hint" id="amtHint">Có thể gõ tắt: 50k, 1,2tr, 2 triệu</span></div>
        <div class="field"><label>Danh mục</label><select class="input" name="categoryId" id="txCat">${catOpts(t.type)}</select></div>
        <div class="field"><label>Ngày</label><input class="input" type="date" name="date" required value="${t.date}"></div>
        <div class="field full"><label>Ghi chú</label><input class="input" name="note" maxlength="120" placeholder="VD: Ăn trưa, tiền điện…" value="${esc(t.note)}"></div>
        ${isCouple() ? `<div class="field"><label id="personLbl">Người chi</label><select class="input" name="person">${personOptions(t.person)}</select></div>
        <div class="field" style="justify-content:flex-end" id="sharedWrap"><label class="check"><input type="checkbox" name="shared" ${t.shared ? 'checked' : ''}> Chi tiêu chung (chia đôi)</label></div>` : ''}
      </div>`,
    onOpen(form) {
      const sync = () => {
        const type = form.type.value;
        $('#txCat').innerHTML = catOpts(type);
        if (isCouple()) { $('#sharedWrap').classList.toggle('hidden', type === 'income'); $('#personLbl').textContent = type === 'income' ? 'Người nhận' : 'Người chi'; }
      };
      $$('input[name=type]', form).forEach(r => r.addEventListener('change', sync));
      if (isCouple()) $('#sharedWrap').classList.toggle('hidden', t.type === 'income');
      form.amount.addEventListener('input', () => { const v = parseMoney(form.amount.value); $('#amtHint').textContent = v ? `= ${money(v)}` : 'Có thể gõ tắt: 50k, 1,2tr, 2 triệu'; });
    },
    onSubmit(d) {
      const amount = Math.abs(parseMoney(d.amount));
      if (!amount) { toast('Vui lòng nhập số tiền hợp lệ'); return false; }
      if (!d.date) { toast('Vui lòng chọn ngày'); return false; }
      const rec = { type: d.type, amount, categoryId: d.categoryId, date: d.date, note: d.note.trim(), person: d.person || 'p1', shared: d.type === 'expense' && !!d.shared };
      if (editing) Object.assign(S.transactions.find(x => x.id === t.id), rec);
      else S.transactions.push({ id: uid(), created: Date.now(), ...rec });
      toast(editing ? 'Đã cập nhật giao dịch' : `Đã thêm ${rec.type === 'income' ? 'khoản thu' : 'khoản chi'} ${money(amount)}`);
    },
  });
}

/* ---------- Budget ---------- */
function viewBudget() {
  const m = S.ui.month, tx = txOfMonth(m);
  const cats = S.categories.filter(c => c.type === 'expense');
  const inc = sum(tx.filter(t => t.type === 'income'));
  const spentBy = id => sum(tx.filter(t => t.type === 'expense' && t.categoryId === id));
  const totalB = sum(cats, c => c.budget), totalS = sum(tx.filter(t => t.type === 'expense'));
  const p = pct(totalS, totalB);
  const rows = cats.map(c => {
    const s = spentBy(c.id), b = c.budget || 0, pp = b ? pct(s, b) : 0;
    const cls = !b ? '' : pp > 100 ? 'over' : pp > 80 ? 'warn' : 'ok';
    return `<tr><td><span style="font-size:18px">${c.icon}</span> <b>${esc(c.name)}</b></td>
      <td class="num right">${money(s)}</td>
      <td><input class="input sm num" data-budget="${c.id}" inputmode="decimal" value="${b ? nf.format(b) : ''}" placeholder="Chưa đặt"></td>
      <td style="min-width:140px"><div class="progress"><span class="${cls}" style="width:${b ? clamp(pp, 2, 100) : 0}%"></span></div>
        <div class="tiny muted">${b ? (s > b ? `<span class="neg">Vượt ${money(s - b)}</span>` : `Còn ${money(b - s)} · ${pp}%`) : '—'}</div></td></tr>`;
  }).join('');
  return `<div class="grid kpis">
      ${kpi('Tổng ngân sách', money(totalB), '🎯', 'purple')}
      ${kpi('Đã chi', money(totalS), '💸', 'red', totalB ? `${p}% ngân sách` : '')}
      ${kpi('Còn được chi', `<span class="${totalB - totalS < 0 ? 'neg' : ''}">${money(totalB - totalS)}</span>`, '👛', 'green')}
    </div>
    <div class="card"><div class="card-head"><h3>Ngân sách theo danh mục</h3><span class="hint">Gõ số tiền rồi nhấn Enter/thoát ô để lưu · Ngân sách áp dụng cho mọi tháng</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Danh mục</th><th class="right">Đã chi</th><th>Ngân sách</th><th>Tiến độ</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
    <div class="card"><div class="card-head"><h3>💡 Gợi ý quy tắc 50/30/20</h3><span class="muted small">Dựa trên thu nhập ${monthLabel(m).toLowerCase()}: ${money(inc)}</span></div>
      ${inc ? `<div class="grid grid-3">
        <div class="stat-pill"><b class="num">${money(inc * 0.5)}</b><span>50% Thiết yếu — nhà ở, ăn uống, hóa đơn, đi lại</span></div>
        <div class="stat-pill"><b class="num">${money(inc * 0.3)}</b><span>30% Mong muốn — mua sắm, giải trí, hẹn hò</span></div>
        <div class="stat-pill"><b class="num">${money(inc * 0.2)}</b><span>20% Tiết kiệm — quỹ cưới, quỹ khẩn cấp, đầu tư</span></div></div>`
      : '<div class="muted small">Thêm khoản thu nhập trong tháng để nhận gợi ý phân bổ.</div>'}</div>`;
}

/* ---------- Goals ---------- */
function goalSaved(g) { return sum(g.contributions); }
function viewGoals() {
  const head = `<div class="card-head" style="margin:0"><div class="muted">${isCouple() ? 'Cùng nhau góp quỹ cho đám cưới, mua nhà, du lịch…' : 'Đặt mục tiêu và theo dõi tiến độ tiết kiệm.'}</div>
    <button class="btn primary" data-action="add-goal">＋ Mục tiêu mới</button></div>`;
  if (!S.goals.length) return head + `<div class="card empty"><div class="big">🐷</div>Chưa có mục tiêu nào.<br><br>
    <button class="btn" data-action="add-goal">Tạo mục tiêu đầu tiên</button></div>`;
  return head + `<div class="grid grid-3">${S.goals.map(g => {
    const saved = goalSaved(g), p = pct(saved, g.target), left = Math.max(g.target - saved, 0);
    let plan = '';
    if (g.deadline && left > 0) {
      const days = daysBetween(today(), g.deadline);
      const months = Math.max(days / 30.44, 0);
      plan = days <= 0 ? '<span class="badge red">Đã quá hạn</span>' : `Cần góp ~<b class="num">${money(left / Math.max(months, 1))}</b>/tháng${isCouple() ? ` (mỗi người ${short(left / Math.max(months, 1) / 2)})` : ''}`;
    }
    const by = isCouple() ? ['p1', 'p2', 'both'].map(k => [k, sum(g.contributions.filter(c => c.person === k))]).filter(x => x[1]) : [];
    const colors = { p1: PALETTE[1], p2: PALETTE[0], both: PALETTE[2] };
    return `<div class="card">
      <div class="goal-head"><div class="goal-ic">${esc(g.icon || '🎯')}</div><div style="flex:1;min-width:0"><h3 style="font-size:16px">${esc(g.name)}</h3>
        <div class="tiny muted">${g.deadline ? 'Hạn: ' + fmtDate(g.deadline) : 'Không đặt hạn'}</div></div>
        ${p >= 100 ? '<span class="badge green">Hoàn thành 🎉</span>' : `<span class="badge rose">${p}%</span>`}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><span class="kpi-val" style="font-size:20px">${money(saved)}</span><span class="muted small">/ ${money(g.target)}</span></div>
      ${by.length && saved > 0
        ? `<div class="stack" style="margin:8px 0">${by.map(([k, v]) => `<span style="width:${clamp((v / Math.max(g.target, saved)) * 100, 0, 100)}%;background:${colors[k]}"></span>`).join('')}</div>
           <div class="legend">${by.map(([k, v]) => `<span><i class="dot" style="background:${colors[k]}"></i>${esc(P(k))}: ${short(v)}</span>`).join('')}</div>`
        : `<div class="progress lg" style="margin:8px 0"><span class="${p >= 100 ? 'ok' : ''}" style="width:${clamp(p, 0, 100)}%"></span></div>`}
      <div class="small" style="margin-top:10px">${left > 0 ? `Còn thiếu <b class="num">${money(left)}</b>` : 'Đã đạt mục tiêu!'}${plan ? '<br>' + plan : ''}</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn sm primary" data-action="contribute" data-id="${g.id}">＋ Góp tiền</button>
        <button class="btn sm" data-action="edit-goal" data-id="${g.id}">Sửa</button><button class="btn sm ghost danger" data-action="del-goal" data-id="${g.id}">Xóa</button></div>
      ${g.contributions.length ? `<details><summary>Lịch sử góp (${g.contributions.length})</summary>
        ${[...g.contributions].sort((a, b) => b.date.localeCompare(a.date)).map(c => `<div class="list-row small"><span style="flex:1">${fmtDate(c.date)}${isCouple() ? ' · ' + esc(P(c.person)) : ''}${c.note ? ' · ' + esc(c.note) : ''}</span>
        <b class="num ${c.amount < 0 ? 'neg' : 'pos'}">${c.amount < 0 ? '−' : '+'}${money(Math.abs(c.amount))}</b>
        <button class="icon-btn" data-action="del-contrib" data-id="${g.id}|${c.id}" aria-label="Xóa">✕</button></div>`).join('')}</details>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function goalModal(g) {
  const editing = !!g;
  g = g || { name: '', icon: isCouple() ? '💍' : '🎯', target: '', deadline: '' };
  openModal({
    title: editing ? 'Sửa mục tiêu' : 'Mục tiêu tiết kiệm mới',
    body: `<div class="form-grid">
      <div class="field" style="grid-column:span 1"><label>Biểu tượng</label><input class="input" name="icon" maxlength="4" value="${esc(g.icon)}"></div>
      <div class="field"><label>Tên mục tiêu</label><input class="input" name="name" required maxlength="60" placeholder="VD: Quỹ cưới, Mua nhà" value="${esc(g.name)}"></div>
      <div class="field"><label>Số tiền mục tiêu</label><input class="input" name="target" inputmode="decimal" placeholder="VD: 300tr" value="${g.target ? nf.format(g.target) : ''}"></div>
      <div class="field"><label>Hạn hoàn thành</label><input class="input" type="date" name="deadline" value="${g.deadline || ''}"></div></div>`,
    onSubmit(d) {
      const target = parseMoney(d.target);
      if (!d.name.trim() || target <= 0) { toast('Vui lòng nhập tên và số tiền mục tiêu'); return false; }
      const rec = { name: d.name.trim(), icon: d.icon.trim() || '🎯', target, deadline: d.deadline };
      if (editing) Object.assign(S.goals.find(x => x.id === g.id), rec);
      else S.goals.push({ id: uid(), ...rec, contributions: [] });
      toast('Đã lưu mục tiêu');
    },
  });
}

function contributeModal(g) {
  openModal({
    title: `Góp tiền: ${g.name}`,
    body: `<div class="form-grid">
      <div class="field full"><label>Số tiền</label><input class="input" name="amount" inputmode="decimal" placeholder="VD: 2tr (số âm để rút ra)"></div>
      ${isCouple() ? `<div class="field"><label>Người góp</label><select class="input" name="person">${personOptions(S.ui.me || 'p1', false, true)}</select></div>` : ''}
      <div class="field"><label>Ngày</label><input class="input" type="date" name="date" value="${today()}"></div>
      <div class="field full"><label>Ghi chú</label><input class="input" name="note" maxlength="80"></div>
      <label class="check full"><input type="checkbox" name="asTx"> Ghi nhận đồng thời là một khoản chi "Tiết kiệm" trong sổ chi tiêu</label></div>`,
    onSubmit(d) {
      const amount = parseMoney(d.amount);
      if (!amount) { toast('Vui lòng nhập số tiền'); return false; }
      const person = d.person || 'p1';
      const goal = findIn(S.goals, g.id); // lấy bản mới nhất (có thể vừa đồng bộ từ đám mây)
      if (!goal) { toast('Mục tiêu không còn tồn tại'); return; }
      goal.contributions.push({ id: uid(), amount, person, date: d.date || today(), note: d.note.trim() });
      if (d.asTx && amount > 0) {
        let cat = S.categories.find(c => c.name === 'Tiết kiệm' && c.type === 'expense');
        if (!cat) { cat = { id: uid(), name: 'Tiết kiệm', icon: '🐷', type: 'expense', color: PALETTE[2], budget: 0 }; S.categories.push(cat); }
        S.transactions.push({ id: uid(), created: Date.now(), type: 'expense', amount, categoryId: cat.id, date: d.date || today(), note: `Góp ${g.name}`, person: person === 'both' ? 'p1' : person, shared: person === 'both' });
      }
      toast(`Đã ${amount > 0 ? 'góp' : 'rút'} ${money(Math.abs(amount))}`);
    },
  });
}

/* ---------- Wedding ---------- */
const itemCost = i => i.actual || i.estimate || 0;
function weddingStats() {
  const W = S.wedding;
  const estimate = sum(W.items, i => i.estimate), actual = sum(W.items, i => i.actual), cost = sum(W.items, itemCost), paid = sum(W.items, i => i.paid);
  const guestsTotal = sum(W.guests, g => g.count || 1);
  const guestsYes = sum(W.guests.filter(g => g.rsvp === 'yes'), g => g.count || 1);
  const guestsNo = sum(W.guests.filter(g => g.rsvp === 'no'), g => g.count || 1);
  const expected = guestsTotal - guestsNo;
  const tables = Math.ceil(expected / (W.perTable || 10));
  const gifts = sum(W.guests, g => g.gift);
  return { estimate, actual, cost, paid, remaining: Math.max(cost - paid, 0), guestsTotal, guestsYes, guestsNo, expected, tables, partyCost: tables * (W.costPerTable || 0), gifts };
}

function viewWedding() {
  const W = S.wedding, tab = S.ui.wtab;
  const tabs = [['overview', '✨ Tổng quan'], ['items', '💰 Chi phí'], ['tasks', '✅ Công việc'], ['guests', '👥 Khách mời']];
  let head;
  if (!W.date) {
    head = `<div class="hero"><div><h2>💍 Bắt đầu kế hoạch cưới</h2><div class="muted">Đặt ngày cưới và ngân sách để nhận checklist theo mốc thời gian và theo dõi chi phí.</div></div>
      <button class="btn primary" data-action="wedding-settings">Thiết lập ngày cưới</button></div>`;
  } else {
    const d = daysBetween(today(), W.date);
    head = `<div class="hero"><div><h2>💒 ${esc(S.settings.name1)} ❤ ${esc(S.settings.name2)}</h2>
      <div class="muted small">Ngày cưới: <b>${fmtDate(W.date)}</b> · Ngân sách: <b>${W.budget ? money(W.budget) : 'chưa đặt'}</b></div>
      <button class="btn sm" style="margin-top:10px" data-action="wedding-settings">⚙️ Cài đặt đám cưới</button></div>
      <div class="countdown">${d >= 0 ? `<div class="cd-box"><b>${d}</b><span>ngày</span></div><div class="cd-box"><b>${Math.floor(d / 7)}</b><span>tuần</span></div><div class="cd-box"><b>${Math.max(Math.round(d / 30.44), 0)}</b><span>tháng</span></div>`
        : `<div class="cd-box"><b>${-d}</b><span>ngày đã cưới</span></div>`}</div></div>`;
  }
  const body = { overview: wOverview, items: wItems, tasks: wTasks, guests: wGuests }[tab] || wOverview;
  return head + `<div class="tabs">${tabs.map(([k, l]) => `<button data-action="wtab" data-id="${k}" class="${tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>` + body();
}

function wOverview() {
  const W = S.wedding, st = weddingStats();
  const budget = W.budget || 0;
  const bp = pct(st.cost, budget);
  const done = W.tasks.filter(t => t.done).length;
  const overdue = W.tasks.filter(t => !t.done && t.due && t.due < today()).length;
  const byPayer = {};
  W.items.forEach(i => { byPayer[i.payer] = (byPayer[i.payer] || 0) + itemCost(i); });
  const byGroup = {};
  W.items.forEach(i => { if (itemCost(i)) byGroup[i.group] = (byGroup[i.group] || 0) + itemCost(i); });
  const groups = Object.entries(byGroup).sort((a, b) => b[1] - a[1]);
  const net = st.gifts - st.cost;

  afterRender.push(() => {
    if (groups.length) mkChart('chWed', doughnutCfg(groups.map(g => g[0]), groups.map(g => g[1]), groups.map((_, i) => PALETTE[i % PALETTE.length])));
  });

  return `<div class="grid kpis">
    ${kpi('Ngân sách', budget ? money(budget) : '—', '🎯', 'purple', budget ? `Dự kiến dùng ${bp}%` : 'Đặt trong Cài đặt đám cưới')}
    ${kpi('Tổng chi phí', money(st.cost), '💍', 'rose', `Dự toán ${short(st.estimate)} · Thực tế ${short(st.actual)}`)}
    ${kpi('Đã thanh toán', money(st.paid), '✅', 'green', `${pct(st.paid, st.cost)}% chi phí`)}
    ${kpi('Còn phải trả', money(st.remaining), '⏳', 'amber')}
  </div>
  ${budget ? `<div class="card"><div class="card-head"><h3>Mức dùng ngân sách</h3><span class="num small ${st.cost > budget ? 'neg' : 'muted'}">${st.cost > budget ? 'Vượt ' + money(st.cost - budget) : 'Còn dư ' + money(budget - st.cost)}</span></div>
    <div class="progress lg"><span class="${bp > 100 ? 'over' : bp > 85 ? 'warn' : 'ok'}" style="width:${clamp(bp, 1, 100)}%"></span></div></div>` : ''}
  <div class="grid grid-2">
    <div class="card"><div class="card-head"><h3>Chi phí theo hạng mục</h3></div>
      ${groups.length ? '<div class="chart-box"><canvas id="chWed"></canvas></div>' : '<div class="empty">Chưa có chi phí</div>'}</div>
    <div class="card"><div class="card-head"><h3>Ai chi trả?</h3></div>
      ${Object.entries(byPayer).filter(x => x[1]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="list-row"><div style="flex:1"><div class="small" style="display:flex;justify-content:space-between"><b>${esc(P(k))}</b><span class="num">${money(v)}</span></div>
        <div class="progress" style="margin-top:6px"><span style="width:${pct(v, st.cost)}%"></span></div></div></div>`).join('') || '<div class="empty small">Chưa có dữ liệu</div>'}
      <div class="hint" style="margin-top:8px">Chỉnh "Bên chi" của từng hạng mục trong tab Chi phí.</div></div>
  </div>
  <div class="grid grid-2e">
    <div class="card"><div class="card-head"><h3>👥 Khách mời & tiền mừng</h3><button class="btn sm ghost" data-action="wtab" data-id="guests">Chi tiết →</button></div>
      <div class="stat-pills">
        <div class="stat-pill"><b>${st.guestsTotal}</b><span>khách mời</span></div>
        <div class="stat-pill"><b>${st.guestsYes}</b><span>đã xác nhận</span></div>
        <div class="stat-pill"><b>${st.tables}</b><span>bàn dự kiến</span></div>
        <div class="stat-pill"><b class="num">${short(st.partyCost)}</b><span>tiền tiệc ước tính</span></div>
        <div class="stat-pill"><b class="num pos">${short(st.gifts)}</b><span>tiền mừng đã nhận</span></div>
      </div>
      <div class="small" style="margin-top:12px">Cân đối (tiền mừng − tổng chi phí): <b class="num ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</b></div></div>
    <div class="card"><div class="card-head"><h3>✅ Tiến độ công việc</h3><button class="btn sm ghost" data-action="wtab" data-id="tasks">Chi tiết →</button></div>
      <div style="display:flex;justify-content:space-between" class="small"><span>${done}/${W.tasks.length} việc hoàn thành</span>${overdue ? `<span class="badge red">${overdue} việc quá hạn</span>` : ''}</div>
      <div class="progress lg" style="margin:8px 0 12px"><span class="ok" style="width:${pct(done, W.tasks.length)}%"></span></div>
      ${W.tasks.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).slice(0, 4).map(t => taskRow(t)).join('') ||
        (W.tasks.length ? '<div class="muted small">Mọi việc đã xong 🎉</div>' : `<div class="muted small">Chưa có việc nào. ${W.date ? '<button class="btn sm" data-action="gen-tasks">Tạo checklist mẫu</button>' : 'Hãy đặt ngày cưới để tạo checklist mẫu.'}</div>`)}
    </div>
  </div>`;
}

function itemStatus(i) {
  const c = itemCost(i);
  if (c && i.paid >= c) return '<span class="badge green">Đã trả đủ</span>';
  if (i.paid > 0) return '<span class="badge amber">Đã cọc</span>';
  return '<span class="badge">Chưa trả</span>';
}
function wItems() {
  const W = S.wedding, st = weddingStats();
  const groups = [...new Set([...WEDDING_GROUPS, ...W.items.map(i => i.group)])].filter(g => W.items.some(i => i.group === g));
  const rows = groups.map(g => {
    const its = W.items.filter(i => i.group === g);
    return `<tr class="group-row"><td colspan="6">${esc(g)}</td><td class="num right" colspan="2">${money(sum(its, itemCost))}</td></tr>` +
      its.map(i => `<tr><td><b>${esc(i.name)}</b>${i.vendor ? `<div class="tiny muted">${esc(i.vendor)}</div>` : ''}${i.note ? `<div class="tiny muted">${esc(i.note)}</div>` : ''}</td>
        <td class="num right">${money(i.estimate)}</td><td class="num right">${i.actual ? money(i.actual) : '<span class="muted">—</span>'}</td>
        <td class="num right">${money(i.paid)}</td><td class="num right">${money(Math.max(itemCost(i) - i.paid, 0))}</td>
        <td class="small">${esc(P(i.payer))}</td><td>${itemStatus(i)}</td>
        <td class="right" style="white-space:nowrap"><button class="icon-btn" data-action="edit-item" data-id="${i.id}" aria-label="Sửa">✏️</button><button class="icon-btn" data-action="del-item" data-id="${i.id}" aria-label="Xóa">🗑️</button></td></tr>`).join('');
  }).join('');
  return `<div class="card"><div class="card-head"><h3>Bảng chi phí đám cưới</h3><button class="btn primary sm" data-action="add-item">＋ Thêm hạng mục</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Hạng mục</th><th class="right">Dự toán</th><th class="right">Thực tế</th><th class="right">Đã trả</th><th class="right">Còn lại</th><th>Bên chi</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="empty">Chưa có hạng mục</td></tr>'}</tbody>
    <tfoot><tr><td>Tổng cộng</td><td class="num right">${money(st.estimate)}</td><td class="num right">${money(st.actual)}</td><td class="num right">${money(st.paid)}</td><td class="num right">${money(st.remaining)}</td><td colspan="3"></td></tr></tfoot></table></div>
    <div class="hint" style="margin-top:10px">Tổng chi phí tính theo số "Thực tế" nếu đã có, ngược lại dùng "Dự toán".</div></div>`;
}

function itemModal(i) {
  const editing = !!i;
  i = i || { group: WEDDING_GROUPS[0], name: '', estimate: '', actual: '', paid: '', vendor: '', payer: 'both', note: '' };
  const m = v => (v ? nf.format(v) : '');
  openModal({
    title: editing ? 'Sửa hạng mục' : 'Thêm hạng mục chi phí',
    body: `<div class="form-grid">
      <div class="field"><label>Nhóm</label><select class="input" name="group">${[...new Set([...WEDDING_GROUPS, i.group])].map(g => opt(g, g, i.group)).join('')}</select></div>
      <div class="field"><label>Tên hạng mục</label><input class="input" name="name" required maxlength="80" value="${esc(i.name)}"></div>
      <div class="field"><label>Dự toán</label><input class="input" name="estimate" inputmode="decimal" placeholder="VD: 15tr" value="${m(i.estimate)}"></div>
      <div class="field"><label>Chi phí thực tế</label><input class="input" name="actual" inputmode="decimal" placeholder="Khi đã chốt giá" value="${m(i.actual)}"></div>
      <div class="field"><label>Đã thanh toán / đặt cọc</label><input class="input" name="paid" inputmode="decimal" value="${m(i.paid)}"></div>
      <div class="field"><label>Bên chi trả</label><select class="input" name="payer">${personOptions(i.payer, true, true)}</select></div>
      <div class="field full"><label>Nhà cung cấp / liên hệ</label><input class="input" name="vendor" maxlength="100" value="${esc(i.vendor)}"></div>
      <div class="field full"><label>Ghi chú</label><input class="input" name="note" maxlength="140" value="${esc(i.note)}"></div></div>`,
    onSubmit(d) {
      if (!d.name.trim()) { toast('Vui lòng nhập tên hạng mục'); return false; }
      const rec = { group: d.group, name: d.name.trim(), estimate: parseMoney(d.estimate), actual: parseMoney(d.actual), paid: parseMoney(d.paid), vendor: d.vendor.trim(), payer: d.payer, note: d.note.trim() };
      if (editing) Object.assign(S.wedding.items.find(x => x.id === i.id), rec);
      else S.wedding.items.push({ id: uid(), ...rec });
      toast('Đã lưu hạng mục');
    },
  });
}

function taskRow(t) {
  const late = !t.done && t.due && t.due < today();
  return `<div class="task ${t.done ? 'done' : ''}"><label class="check"><input type="checkbox" data-task="${t.id}" ${t.done ? 'checked' : ''}></label>
    <div class="task-title"><div>${esc(t.title)}</div><div class="tiny ${late ? 'neg' : 'muted'}">${t.due ? fmtDate(t.due) : 'Chưa đặt hạn'}${t.owner && isCouple() ? ' · ' + esc(P(t.owner)) : ''}</div></div>
    <button class="icon-btn" data-action="edit-task" data-id="${t.id}" aria-label="Sửa">✏️</button><button class="icon-btn" data-action="del-task" data-id="${t.id}" aria-label="Xóa">🗑️</button></div>`;
}
function wTasks() {
  const T = S.wedding.tasks, td = today(), soon = addDays(td, 30);
  const sorted = [...T].sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const secs = [
    ['⚠️ Quá hạn', sorted.filter(t => !t.done && t.due && t.due < td)],
    ['🔥 Trong 30 ngày tới', sorted.filter(t => !t.done && t.due && t.due >= td && t.due <= soon)],
    ['📅 Sắp tới', sorted.filter(t => !t.done && t.due && t.due > soon)],
    ['🗂 Chưa có hạn', sorted.filter(t => !t.done && !t.due)],
    ['✅ Đã hoàn thành', sorted.filter(t => t.done)],
  ].filter(s => s[1].length);
  return `<div class="card"><div class="card-head"><h3>Checklist chuẩn bị cưới</h3><div class="btn-row">
      ${S.wedding.date ? '<button class="btn sm" data-action="gen-tasks">✨ Thêm checklist mẫu</button>' : ''}
      <button class="btn primary sm" data-action="add-task">＋ Thêm việc</button></div></div>
    ${secs.length ? secs.map(([l, ts]) => `<div class="task-sec">${l} (${ts.length})</div>${ts.map(taskRow).join('')}`).join('')
      : `<div class="empty"><div class="big">📝</div>Chưa có việc nào.${S.wedding.date ? '' : ' Đặt ngày cưới để tạo checklist mẫu theo mốc thời gian.'}</div>`}</div>`;
}
function taskModal(t) {
  const editing = !!t;
  t = t || { title: '', due: '', owner: 'both' };
  openModal({
    title: editing ? 'Sửa công việc' : 'Thêm công việc',
    body: `<div class="form-grid"><div class="field full"><label>Công việc</label><input class="input" name="title" required maxlength="120" value="${esc(t.title)}"></div>
      <div class="field"><label>Hạn</label><input class="input" type="date" name="due" value="${t.due || ''}"></div>
      ${isCouple() ? `<div class="field"><label>Người phụ trách</label><select class="input" name="owner">${opt('both', 'Cả hai', t.owner)}${personOptions(t.owner, true)}</select></div>` : ''}</div>`,
    onSubmit(d) {
      if (!d.title.trim()) { toast('Vui lòng nhập tên công việc'); return false; }
      const rec = { title: d.title.trim(), due: d.due, owner: d.owner || 'both' };
      if (editing) Object.assign(S.wedding.tasks.find(x => x.id === t.id), rec);
      else S.wedding.tasks.push({ id: uid(), done: false, ...rec });
    },
  });
}

const SIDE = k => ({ p1: `Khách ${S.settings.name1}`, p2: `Khách ${S.settings.name2}`, both: 'Bạn chung' }[k] || '—');
const RSVP = { pending: ['Chưa xác nhận', ''], yes: ['Sẽ đến', 'green'], no: ['Không đến', 'red'] };
function wGuests() {
  const W = S.wedding, st = weddingStats(), side = S.ui.guestSide;
  const list = W.guests.filter(g => !side || g.side === side);
  const sideTotals = ['p1', 'p2', 'both'].map(k => [k, sum(W.guests.filter(g => g.side === k), g => g.count || 1), sum(W.guests.filter(g => g.side === k), g => g.gift)]);
  return `<div class="card"><div class="stat-pills">
      <div class="stat-pill"><b>${st.guestsTotal}</b><span>tổng khách (người)</span></div>
      <div class="stat-pill"><b>${st.guestsYes}</b><span>sẽ đến</span></div>
      <div class="stat-pill"><b>${st.guestsNo}</b><span>không đến</span></div>
      <div class="stat-pill"><b>${st.tables}</b><span>bàn (${W.perTable} người/bàn)</span></div>
      <div class="stat-pill"><b class="num">${money(st.partyCost)}</b><span>tiền tiệc ước tính</span></div>
      <div class="stat-pill"><b class="num pos">${money(st.gifts)}</b><span>tiền mừng</span></div></div>
    <div class="legend" style="margin-top:12px">${sideTotals.map(([k, n, g]) => `<span><b>${esc(SIDE(k))}</b>: ${n} người · ${short(g)}</span>`).join('')}</div></div>
    <div class="card"><div class="card-head"><div class="filters">
        <select class="input" data-guest-side style="min-width:160px">${opt('', 'Tất cả khách', side)}${['p1', 'p2', 'both'].map(k => opt(k, SIDE(k), side)).join('')}</select></div>
      <div class="btn-row"><button class="btn sm" data-action="bulk-guests">📋 Thêm nhanh nhiều khách</button><button class="btn primary sm" data-action="add-guest">＋ Thêm khách</button></div></div>
    ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Tên khách</th><th>Bên</th><th>Nhóm</th><th class="right">Số người</th><th>Xác nhận</th><th>Tiền mừng</th><th></th></tr></thead><tbody>
      ${list.map(g => `<tr><td><b>${esc(g.name)}</b>${g.note ? `<div class="tiny muted">${esc(g.note)}</div>` : ''}</td><td class="small">${esc(SIDE(g.side))}</td><td class="small">${esc(g.group || '')}</td>
        <td class="right num">${g.count || 1}</td>
        <td><select class="input sm" data-rsvp="${g.id}" style="min-width:130px">${Object.entries(RSVP).map(([k, [l]]) => opt(k, l, g.rsvp || 'pending')).join('')}</select></td>
        <td><input class="input sm num" data-gift="${g.id}" inputmode="decimal" placeholder="0" value="${g.gift ? nf.format(g.gift) : ''}"></td>
        <td class="right" style="white-space:nowrap"><button class="icon-btn" data-action="edit-guest" data-id="${g.id}" aria-label="Sửa">✏️</button><button class="icon-btn" data-action="del-guest" data-id="${g.id}" aria-label="Xóa">🗑️</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty"><div class="big">💌</div>Chưa có khách mời nào</div>'}</div>`;
}
function guestModal(g) {
  const editing = !!g;
  g = g || { name: '', side: 'both', group: '', count: 1, rsvp: 'pending', gift: '', note: '' };
  openModal({
    title: editing ? 'Sửa khách mời' : 'Thêm khách mời',
    body: `<div class="form-grid"><div class="field full"><label>Tên khách</label><input class="input" name="name" required maxlength="80" value="${esc(g.name)}"></div>
      <div class="field"><label>Khách của</label><select class="input" name="side">${['p1', 'p2', 'both'].map(k => opt(k, SIDE(k), g.side)).join('')}</select></div>
      <div class="field"><label>Nhóm</label><input class="input" name="group" maxlength="40" list="guestGroups" placeholder="Gia đình, Đồng nghiệp…" value="${esc(g.group)}">
        <datalist id="guestGroups">${['Gia đình', 'Họ hàng', 'Bạn thân', 'Bạn học', 'Đồng nghiệp', 'Hàng xóm'].map(x => `<option value="${x}">`).join('')}</datalist></div>
      <div class="field"><label>Số người</label><input class="input" type="number" name="count" min="1" max="50" value="${g.count || 1}"></div>
      <div class="field"><label>Xác nhận</label><select class="input" name="rsvp">${Object.entries(RSVP).map(([k, [l]]) => opt(k, l, g.rsvp)).join('')}</select></div>
      <div class="field"><label>Tiền mừng</label><input class="input" name="gift" inputmode="decimal" value="${g.gift ? nf.format(g.gift) : ''}"></div>
      <div class="field"><label>Ghi chú</label><input class="input" name="note" maxlength="80" value="${esc(g.note)}"></div></div>`,
    onSubmit(d) {
      if (!d.name.trim()) { toast('Vui lòng nhập tên khách'); return false; }
      const rec = { name: d.name.trim(), side: d.side, group: d.group.trim(), count: clamp(parseInt(d.count, 10) || 1, 1, 50), rsvp: d.rsvp, gift: parseMoney(d.gift), note: d.note.trim() };
      if (editing) Object.assign(S.wedding.guests.find(x => x.id === g.id), rec);
      else S.wedding.guests.push({ id: uid(), ...rec });
    },
  });
}

function weddingSettingsModal() {
  const W = S.wedding;
  openModal({
    title: 'Cài đặt đám cưới',
    body: `<div class="form-grid">
      <div class="field"><label>Ngày cưới</label><input class="input" type="date" name="date" value="${W.date}"></div>
      <div class="field"><label>Tổng ngân sách cưới</label><input class="input" name="budget" inputmode="decimal" placeholder="VD: 400tr" value="${W.budget ? nf.format(W.budget) : ''}"></div>
      <div class="field"><label>Số người / bàn</label><input class="input" type="number" min="1" max="30" name="perTable" value="${W.perTable}"></div>
      <div class="field"><label>Giá mỗi bàn tiệc</label><input class="input" name="costPerTable" inputmode="decimal" value="${nf.format(W.costPerTable || 0)}"></div>
      ${!W.tasks.length ? '<label class="check full"><input type="checkbox" name="gen" checked> Tạo checklist công việc mẫu theo ngày cưới</label>' : ''}</div>`,
    onSubmit(d) {
      const W = S.wedding;
      W.date = d.date; W.budget = parseMoney(d.budget);
      W.perTable = clamp(parseInt(d.perTable, 10) || 10, 1, 30); W.costPerTable = parseMoney(d.costPerTable);
      if (d.gen && W.date) genTasks(true);
      toast('Đã lưu cài đặt đám cưới');
    },
  });
}

function genTasks(silent) {
  const W = S.wedding;
  if (!W.date) return toast('Hãy đặt ngày cưới trước');
  const existing = new Set(W.tasks.map(t => t.title));
  let added = 0;
  TASK_TEMPLATE.forEach(([days, title]) => {
    if (existing.has(title)) return;
    W.tasks.push({ id: uid(), title, due: addDays(W.date, -days), owner: 'both', done: false }); added++;
  });
  if (!silent) toast(added ? `Đã thêm ${added} việc vào checklist` : 'Checklist mẫu đã có đủ');
}

/* ---------- Settings ---------- */
function viewSettings() {
  const s = S.settings;
  const cats = type => S.categories.filter(c => c.type === type).map(c => `<span class="cat-chip">${c.icon} ${esc(c.name)}<button class="icon-btn" data-action="del-cat" data-id="${c.id}" aria-label="Xóa danh mục">✕</button></span>`).join('');
  return `<div class="card" id="cloudCard"></div>
  <div class="grid grid-2e">
    <div class="card"><div class="card-head"><h3>👤 Hồ sơ</h3></div>
      <form id="profileForm" class="form-grid">
        <div class="field full"><span class="lbl">Chế độ sử dụng</span><div class="seg">
          <label><input type="radio" name="mode" value="personal" ${s.mode === 'personal' ? 'checked' : ''}><span>🙋 Cá nhân</span></label>
          <label><input type="radio" name="mode" value="couple" ${s.mode === 'couple' ? 'checked' : ''}><span>💑 Cặp đôi sắp cưới</span></label></div></div>
        <div class="field"><label>${s.mode === 'couple' ? 'Tên người thứ nhất' : 'Tên của bạn'}</label><input class="input" name="name1" maxlength="30" value="${esc(s.name1)}"></div>
        <div class="field"><label>Tên người thứ hai</label><input class="input" name="name2" maxlength="30" value="${esc(s.name2)}"></div>
        ${s.mode === 'couple' ? `<div class="field full"><label>Trên thiết bị này, tôi là</label><select class="input" name="me">${opt('p1', s.name1, S.ui.me)}${opt('p2', s.name2, S.ui.me)}</select>
          <span class="hint">Dùng để tự chọn sẵn "Người chi" khi thêm giao dịch. Chỉ lưu trên thiết bị này.</span></div>` : ''}
        <div class="full"><button class="btn primary" type="submit">Lưu hồ sơ</button></div></form></div>
    <div class="card"><div class="card-head"><h3>🎨 Giao diện</h3></div>
      <div class="seg">${[['auto', '🖥 Theo hệ thống'], ['light', '☀️ Sáng'], ['dark', '🌙 Tối']].map(([k, l]) => `<label><input type="radio" name="theme" data-theme-pick value="${k}" ${s.theme === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <div class="card-head" style="margin-top:22px"><h3>💾 Dữ liệu</h3></div>
      <p class="muted small" style="margin-top:0">Dữ liệu chỉ lưu trên trình duyệt này. Hãy xuất file sao lưu định kỳ hoặc để chuyển sang máy khác.</p>
      <div class="btn-row"><button class="btn" data-action="export-json">⬇ Sao lưu (JSON)</button><button class="btn" data-action="import-json">⬆ Khôi phục</button>
        <button class="btn" data-action="export-csv">⬇ Giao dịch (CSV)</button><button class="btn" data-action="load-sample">🧪 Dữ liệu mẫu</button>
        <button class="btn danger" data-action="reset">🗑 Xóa toàn bộ</button></div></div>
  </div>
  <div class="card"><div class="card-head"><h3>🏷 Danh mục</h3><button class="btn sm primary" data-action="add-cat">＋ Thêm danh mục</button></div>
    <div class="lbl" style="margin-bottom:8px">Khoản chi</div><div>${cats('expense')}</div>
    <div class="lbl" style="margin:10px 0 8px">Khoản thu</div><div>${cats('income')}</div></div>`;
}

function catModal() {
  openModal({
    title: 'Thêm danh mục',
    body: `<div class="seg"><label><input type="radio" name="type" value="expense" checked><span>Khoản chi</span></label><label><input type="radio" name="type" value="income"><span>Khoản thu</span></label></div>
      <div class="form-grid"><div class="field"><label>Biểu tượng (emoji)</label><input class="input" name="icon" maxlength="4" value="🏷️"></div>
      <div class="field"><label>Tên danh mục</label><input class="input" name="name" required maxlength="30"></div></div>`,
    onSubmit(d) {
      if (!d.name.trim()) { toast('Vui lòng nhập tên danh mục'); return false; }
      S.categories.push({ id: uid(), name: d.name.trim(), icon: d.icon.trim() || '🏷️', type: d.type, color: PALETTE[S.categories.length % PALETTE.length], budget: 0 });
      toast('Đã thêm danh mục');
    },
  });
}

function onboarding() {
  S.settings.onboarded = true; save(); // không hiện lại nếu người dùng bấm Hủy
  openModal({
    title: 'Chào mừng đến với Chung Ví 💍',
    submitText: 'Bắt đầu',
    body: `<p class="muted" style="margin:0">Bạn muốn dùng Chung Ví thế nào?</p>
      <div class="seg"><label><input type="radio" name="mode" value="couple" checked><span>💑 Cặp đôi sắp cưới</span></label>
        <label><input type="radio" name="mode" value="personal"><span>🙋 Cá nhân</span></label></div>
      <div class="form-grid"><div class="field"><label>Tên của bạn</label><input class="input" name="name1" maxlength="30" placeholder="VD: Minh"></div>
        <div class="field couple-only"><label>Tên người ấy</label><input class="input" name="name2" maxlength="30" placeholder="VD: Lan"></div>
        <div class="field couple-only"><label>Ngày cưới (nếu đã có)</label><input class="input" type="date" name="date"></div>
        <div class="field couple-only"><label>Ngân sách cưới dự kiến</label><input class="input" name="budget" inputmode="decimal" placeholder="VD: 400tr"></div></div>`,
    onOpen(form) {
      const sync = () => $$('.couple-only', form).forEach(el => el.classList.toggle('hidden', form.mode.value !== 'couple'));
      $$('input[name=mode]', form).forEach(r => r.addEventListener('change', sync));
    },
    onSubmit(d) {
      S.settings.mode = d.mode;
      S.settings.name1 = d.name1.trim() || 'Anh';
      S.settings.name2 = (d.name2 || '').trim() || 'Em';
      if (d.mode === 'couple') {
        S.wedding.date = d.date || '';
        S.wedding.budget = parseMoney(d.budget);
        if (S.wedding.date && !S.wedding.tasks.length) genTasks(true);
      }
      S.settings.onboarded = true;
    },
  });
}

/* ---------- Sample data ---------- */
const cloudOn = () => !!(window.chungviCloud && window.chungviCloud.isSignedIn());
function loadSample() {
  const warn = cloudOn() ? 'Dữ liệu mẫu sẽ THAY THẾ toàn bộ dữ liệu, KỂ CẢ trên đám mây (cả hai người đều thấy). Tiếp tục?' : 'Dữ liệu mẫu sẽ THAY THẾ toàn bộ dữ liệu hiện tại. Tiếp tục?';
  if ((S.transactions.length || cloudOn()) && !confirm(warn)) return;
  const keepTheme = S.settings.theme, keepUi = { me: S.ui.me, cloudUid: S.ui.cloudUid };
  S = defaultState();
  Object.assign(S.ui, keepUi);
  Object.assign(S.settings, { mode: 'couple', name1: 'Minh', name2: 'Lan', theme: keepTheme, onboarded: true });
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cat = n => S.categories.find(c => c.name === n).id;
  const budgets = { 'Ăn uống': 6e6, 'Đi lại': 1.5e6, 'Nhà ở': 7e6, 'Hóa đơn': 2e6, 'Mua sắm': 3e6, 'Giải trí': 1.5e6, 'Hẹn hò': 2e6 };
  S.categories.forEach(c => { if (budgets[c.name]) c.budget = budgets[c.name]; });
  const add = (type, amount, c, date, note, person, shared = false) => S.transactions.push({ id: uid(), created: Date.now() + S.transactions.length, type, amount, categoryId: cat(c), date, note, person, shared });
  const pool = [['Ăn uống', 'Ăn trưa', 4e4, 9e4], ['Ăn uống', 'Cà phê', 3e4, 6e4], ['Ăn uống', 'Đi chợ', 2e5, 6e5], ['Đi lại', 'Xăng xe', 7e4, 1.2e5], ['Đi lại', 'Grab', 4e4, 1.5e5],
    ['Mua sắm', 'Quần áo', 3e5, 9e5], ['Giải trí', 'Xem phim', 1.6e5, 2.6e5], ['Hẹn hò', 'Ăn tối cuối tuần', 4e5, 9e5], ['Sức khỏe', 'Thuốc', 8e4, 3e5], ['Hiếu hỷ', 'Mừng cưới bạn', 5e5, 1e6]];
  for (let k = 3; k >= 0; k--) {
    const m = shiftMonth(curMonth(), -k), lastDay = k === 0 ? +today().slice(8) : 28;
    const d = n => `${m}-${pad(clamp(n, 1, lastDay))}`;
    if (lastDay >= 5) { add('income', 22e6, 'Lương', d(5), 'Lương tháng', 'p1'); add('income', 18e6, 'Lương', d(5), 'Lương tháng', 'p2'); }
    if (k === 1) add('income', 5e6, 'Thưởng', d(20), 'Thưởng dự án', 'p2');
    add('expense', 6.5e6, 'Nhà ở', d(1), 'Tiền thuê nhà', 'p1', true);
    if (lastDay >= 10) add('expense', 1.4e6 + Math.round(rnd() * 4e5 / 1e3) * 1e3, 'Hóa đơn', d(10), 'Điện, nước, internet', 'p2', true);
    for (let i = 0; i < 16; i++) {
      const [c, note, lo, hi] = pool[Math.floor(rnd() * pool.length)];
      const amt = Math.round((lo + rnd() * (hi - lo)) / 1e3) * 1e3;
      const person = rnd() > 0.5 ? 'p1' : 'p2';
      add('expense', amt, c, d(1 + Math.floor(rnd() * lastDay)), note, person, ['Đi chợ', 'Ăn tối cuối tuần', 'Xem phim'].includes(note));
    }
  }
  const W = S.wedding;
  W.date = addDays(today(), 150); W.budget = 400e6; W.costPerTable = 6.5e6;
  const setItem = (name, actual, paid, vendor, payer) => { const it = W.items.find(i => i.name === name); Object.assign(it, { actual, paid, vendor, payer }); };
  setItem('Tiệc nhà hàng', 0, 30e6, 'Nhà hàng Hoa Sen — 0900 000 000', 'both');
  setItem('Chụp ảnh cưới (pre-wedding)', 18e6, 18e6, 'Studio Mây', 'p1');
  setItem('Nhẫn cưới', 16.5e6, 5e6, 'Tiệm vàng Kim Phát', 'p1');
  setItem('Váy cưới & vest', 0, 3e6, '', 'p2');
  setItem('Tráp ăn hỏi (mâm quả)', 0, 0, '', 'f1');
  genTasks(true);
  W.tasks.forEach(t => { if (t.due < today()) t.done = rnd() > 0.25; });
  const names = [['Bố mẹ & ông bà nội', 'p1', 'Gia đình', 6], ['Họ hàng bên nội', 'p1', 'Họ hàng', 20], ['Bố mẹ & ông bà ngoại', 'p2', 'Gia đình', 5],
    ['Họ hàng bên ngoại', 'p2', 'Họ hàng', 18], ['Nhóm bạn đại học', 'both', 'Bạn học', 12], ['Team công ty Minh', 'p1', 'Đồng nghiệp', 15],
    ['Team công ty Lan', 'p2', 'Đồng nghiệp', 14], ['Hàng xóm', 'both', 'Hàng xóm', 8], ['Bạn thân Hùng', 'p1', 'Bạn thân', 2], ['Bạn thân Thảo', 'p2', 'Bạn thân', 2]];
  names.forEach(([name, side, group, count], i) => W.guests.push({ id: uid(), name, side, group, count, rsvp: i % 3 === 0 ? 'yes' : 'pending', gift: 0, note: '' }));
  S.goals.push({ id: uid(), name: 'Quỹ cưới', icon: '💍', target: 300e6, deadline: W.date, contributions: [
    { id: uid(), amount: 60e6, person: 'p1', date: addDays(today(), -60), note: 'Tiết kiệm sẵn' }, { id: uid(), amount: 45e6, person: 'p2', date: addDays(today(), -60), note: 'Tiết kiệm sẵn' },
    { id: uid(), amount: 8e6, person: 'p1', date: addDays(today(), -25), note: '' }, { id: uid(), amount: 7e6, person: 'p2', date: addDays(today(), -25), note: '' }] });
  S.goals.push({ id: uid(), name: 'Mua nhà', icon: '🏡', target: 1.5e9, deadline: addDays(today(), 365 * 4), contributions: [{ id: uid(), amount: 120e6, person: 'both', date: addDays(today(), -90), note: 'Quỹ chung ban đầu' }] });
  S.goals.push({ id: uid(), name: 'Tuần trăng mật Phú Quốc', icon: '🏝️', target: 30e6, deadline: addDays(W.date, 5), contributions: [{ id: uid(), amount: 6e6, person: 'p2', date: addDays(today(), -10), note: '' }] });
  save(); render(); toast('Đã tải dữ liệu mẫu của Minh & Lan');
}

/* ---------- Export / Import ---------- */
function exportCSV() {
  const rows = [['Ngày', 'Loại', 'Danh mục', 'Số tiền', 'Ghi chú', ...(isCouple() ? ['Người', 'Chia đôi'] : [])]];
  [...S.transactions].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => rows.push([
    t.date, t.type === 'income' ? 'Thu' : 'Chi', catById(t.categoryId).name, t.amount, t.note, ...(isCouple() ? [P(t.person), t.shared ? 'Có' : ''] : []),
  ]));
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`chung-vi-giao-dich-${today()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || typeof d !== 'object' || !Array.isArray(d.transactions)) throw new Error('bad');
    if (!confirm('Khôi phục sẽ thay thế toàn bộ dữ liệu hiện tại. Tiếp tục?')) return;
    const keepUi = { me: S.ui.me, cloudUid: S.ui.cloudUid };
    S = normalize(d); Object.assign(S.ui, keepUi); S.settings.onboarded = true; save(); render(); toast('Đã khôi phục dữ liệu');
  } catch { toast('File không hợp lệ'); }
});

/* =========================================================
   EVENTS
   ========================================================= */
const findIn = (arr, id) => arr.find(x => x.id === id);
const ACTIONS = {
  'close-modal': closeModal,
  'month-prev': () => { S.ui.month = shiftMonth(S.ui.month, -1); render(); },
  'month-next': () => { S.ui.month = shiftMonth(S.ui.month, 1); render(); },
  'toggle-theme': () => {
    const dark = document.documentElement.dataset.theme === 'dark' || (S.settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    S.settings.theme = dark ? 'light' : 'dark'; save(); render();
  },
  'add-tx': () => txModal(),
  'edit-tx': id => txModal({ ...findIn(S.transactions, id) }),
  'del-tx': id => { if (confirm('Xóa giao dịch này?')) { S.transactions = S.transactions.filter(t => t.id !== id); save(); render(); toast('Đã xóa'); } },
  'export-csv': () => (S.transactions.length ? exportCSV() : toast('Chưa có giao dịch để xuất')),
  'export-json': () => download(`chung-vi-sao-luu-${today()}.json`, JSON.stringify(S, null, 2), 'application/json'),
  'import-json': () => $('#importFile').click(),
  'load-sample': loadSample,
  reset: () => {
    const msg = cloudOn() ? 'Xóa TOÀN BỘ dữ liệu, KỂ CẢ trên đám mây (người ấy cũng sẽ mất dữ liệu)? Thao tác không thể hoàn tác.' : 'Xóa TOÀN BỘ dữ liệu trên thiết bị này? Thao tác không thể hoàn tác.';
    if (!confirm(msg)) return;
    const keepUi = { me: S.ui.me, cloudUid: S.ui.cloudUid };
    S = defaultState(); Object.assign(S.ui, keepUi); save(); render(); onboarding();
  },
  'add-goal': () => goalModal(),
  'edit-goal': id => goalModal(findIn(S.goals, id)),
  'del-goal': id => { if (confirm('Xóa mục tiêu và toàn bộ lịch sử góp?')) { S.goals = S.goals.filter(g => g.id !== id); save(); render(); } },
  contribute: id => contributeModal(findIn(S.goals, id)),
  'del-contrib': key => {
    const [gid, cid] = key.split('|'), g = findIn(S.goals, gid);
    if (g && confirm('Xóa lần góp này?')) { g.contributions = g.contributions.filter(c => c.id !== cid); save(); render(); }
  },
  wtab: id => { S.ui.wtab = id; save(); render(); },
  'wedding-settings': weddingSettingsModal,
  'add-item': () => itemModal(),
  'edit-item': id => itemModal(findIn(S.wedding.items, id)),
  'del-item': id => { if (confirm('Xóa hạng mục này?')) { S.wedding.items = S.wedding.items.filter(i => i.id !== id); save(); render(); } },
  'gen-tasks': () => { genTasks(); save(); render(); },
  'add-task': () => taskModal(),
  'edit-task': id => taskModal(findIn(S.wedding.tasks, id)),
  'del-task': id => { S.wedding.tasks = S.wedding.tasks.filter(t => t.id !== id); save(); render(); },
  'add-guest': () => guestModal(),
  'edit-guest': id => guestModal(findIn(S.wedding.guests, id)),
  'del-guest': id => { if (confirm('Xóa khách mời này?')) { S.wedding.guests = S.wedding.guests.filter(g => g.id !== id); save(); render(); } },
  'bulk-guests': () => openModal({
    title: 'Thêm nhanh nhiều khách',
    submitText: 'Thêm',
    body: `<div class="field"><label>Mỗi dòng một khách. Có thể thêm số người sau dấu phẩy, VD: "Gia đình chú Ba, 4"</label>
      <textarea class="input" name="list" rows="8" placeholder="Cô Hoa, 2&#10;Anh Tuấn&#10;Gia đình bác Năm, 5"></textarea></div>
      <div class="form-grid"><div class="field"><label>Khách của</label><select class="input" name="side">${['p1', 'p2', 'both'].map(k => opt(k, SIDE(k), 'both')).join('')}</select></div>
      <div class="field"><label>Nhóm</label><input class="input" name="group" maxlength="40" placeholder="VD: Họ hàng"></div></div>`,
    onSubmit(d) {
      const lines = d.list.split('\n').map(s => s.trim()).filter(Boolean);
      if (!lines.length) { toast('Danh sách trống'); return false; }
      lines.forEach(line => {
        const m = line.match(/^(.*?)[,;\t]\s*(\d+)\s*$/);
        S.wedding.guests.push({ id: uid(), name: (m ? m[1] : line).slice(0, 80), side: d.side, group: d.group.trim(), count: m ? clamp(+m[2], 1, 50) : 1, rsvp: 'pending', gift: 0, note: '' });
      });
      toast(`Đã thêm ${lines.length} khách`);
    },
  }),
  'add-cat': catModal,
  'del-cat': id => {
    const used = S.transactions.some(t => t.categoryId === id);
    if (S.categories.filter(c => c.type === catById(id).type).length <= 1) return toast('Cần giữ lại ít nhất một danh mục');
    if (!confirm(used ? 'Danh mục đang được dùng. Các giao dịch sẽ hiển thị "Không rõ". Vẫn xóa?' : 'Xóa danh mục này?')) return;
    S.categories = S.categories.filter(c => c.id !== id); save(); render();
  },
};

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-view], [data-view-link]');
  if (nav) {
    S.ui.view = nav.dataset.view || nav.dataset.viewLink; save(); render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) { e.preventDefault(); ACTIONS[el.dataset.action](el.dataset.id, el); }
});

document.addEventListener('input', e => {
  const f = e.target.dataset.filter;
  if (f === 'q') { S.ui.filter.q = e.target.value; $('#txList').innerHTML = txListHTML(); }
});

document.addEventListener('change', e => {
  const t = e.target, ds = t.dataset;
  if (ds.filter && ds.filter !== 'q') {
    S.ui.filter[ds.filter] = t.type === 'checkbox' ? t.checked : t.value;
    save(); $('#txList').innerHTML = txListHTML(); return;
  }
  if (ds.budget) { const c = catById(ds.budget); c.budget = Math.max(parseMoney(t.value), 0); save(); render(); toast(`Ngân sách ${c.name}: ${money(c.budget)}`); return; }
  if (ds.task) { const k = findIn(S.wedding.tasks, ds.task); if (k) { k.done = t.checked; save(); render(); if (t.checked) toast('🎉 Hoàn thành: ' + k.title); } return; }
  if (ds.rsvp) { const g = findIn(S.wedding.guests, ds.rsvp); g.rsvp = t.value; save(); render(); return; }
  if (ds.gift) { const g = findIn(S.wedding.guests, ds.gift); g.gift = Math.max(parseMoney(t.value), 0); save(); render(); return; }
  if ('guestSide' in ds) { S.ui.guestSide = t.value; save(); render(); return; }
  if ('themePick' in ds) { S.settings.theme = t.value; save(); render(); return; }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('[data-budget], [data-gift]')) e.target.blur();
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'profileForm') return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  S.settings.mode = d.mode;
  S.settings.name1 = d.name1.trim() || S.settings.name1;
  S.settings.name2 = d.name2.trim() || S.settings.name2;
  if (d.me) S.ui.me = d.me;
  save(); render(); toast('Đã lưu hồ sơ');
});

function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.settings.theme === 'auto') render(); });

/* ---------- Boot ---------- */
function boot() {
  render();
  if (!S.settings.onboarded) onboarding();
  // PWA: chạy offline & cài lên màn hình chính (bỏ qua trong app iOS/Android đóng gói bằng Capacitor)
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure && !window.Capacitor) navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (window.Chart || document.readyState === 'complete') boot();
else window.addEventListener('load', boot);
