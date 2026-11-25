/* =========================================================
   Chung Ví — Đồng bộ đám mây (Firebase Auth + Cloud Firestore)

   Mô hình dữ liệu:
     users/{uid}                 { householdId, email }
     invites/{CODE}              { hid }                  — mã mời 8 ký tự để người ấy tham gia
     households/{hid}            { members[], owner, inviteCode, settings, categories, goals, wedding }
     households/{hid}/tx/{id}    một giao dịch / tài liệu (không giới hạn số lượng)

   - Lần đầu đăng ký: dữ liệu đang có trên máy được chuyển lên đám mây.
   - Đăng nhập trên máy khác / tham gia bằng mã mời: dữ liệu đám mây thay cho dữ liệu trên máy.
   - Firestore có cache offline: sửa khi mất mạng sẽ tự đẩy lên khi có mạng lại.
   ========================================================= */
import config from './firebase-config.js';

const app = window.chungvi;
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const DOC_KEYS = ['settings', 'categories', 'goals', 'wedding'];
const configured = !!(config && config.apiKey && config.projectId);

let fb = null, auth = null, db = null;
let user = null, hid = null, inviteCode = null, memberCount = 0;
let unsubs = [];
let status = configured ? 'loading' : 'off'; // off | loading | signed-out | connecting | synced | pending | offline | error
let statusMsg = '';
let ready = false;          // đã nhận dữ liệu ban đầu từ đám mây
let gotMain = false, gotTx = false, localWins = false;
let lastKeys = {};          // key -> chuỗi JSON ổn định của bản trên đám mây
let remoteTx = new Map();   // id -> object
let lastTx = new Map();     // id -> chuỗi JSON ổn định
let busy = false;

/* ---------- Tiện ích ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
const clean = v => JSON.parse(JSON.stringify(v ?? null)); // bỏ undefined (Firestore không nhận)
function pick(S, k) {
  if (k === 'settings') { const { theme, onboarded, ...rest } = S.settings; return clean(rest); }
  return clean(S[k]);
}
function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm (0/O, 1/I)
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map(x => A[x % A.length]).join('');
}
const hRef = () => fb.doc(db, 'households', hid);
const AUTH_ERR = {
  'auth/invalid-email': 'Email không hợp lệ',
  'auth/missing-password': 'Vui lòng nhập mật khẩu',
  'auth/weak-password': 'Mật khẩu cần ít nhất 6 ký tự',
  'auth/email-already-in-use': 'Email này đã có tài khoản — hãy chọn Đăng nhập',
  'auth/invalid-credential': 'Sai email hoặc mật khẩu',
  'auth/wrong-password': 'Sai email hoặc mật khẩu',
  'auth/user-not-found': 'Chưa có tài khoản với email này',
  'auth/too-many-requests': 'Thử quá nhiều lần, vui lòng đợi một lát',
  'auth/network-request-failed': 'Không có kết nối mạng',
  'permission-denied': 'Không có quyền truy cập (kiểm tra firestore.rules)',
};
const errText = e => {
  const code = (e && e.code) || '';
  if (code.startsWith('auth/api-key-not-valid')) return 'Cấu hình Firebase sai (apiKey) — kiểm tra www/js/firebase-config.js';
  if (code === 'auth/operation-not-allowed') return 'Chưa bật đăng nhập Email/Password trong Firebase Authentication';
  return AUTH_ERR[code] || (e && e.message) || String(e);
};

function setStatus(s, msg = '') {
  status = s; statusMsg = msg;
  const b = $('#syncBadge');
  if (b) {
    const map = {
      off: null, loading: ['busy', 'Đang tải…'], 'signed-out': ['', 'Chưa đăng nhập'], connecting: ['busy', 'Đang kết nối…'],
      synced: ['ok', 'Đã đồng bộ'], pending: ['busy', 'Đang lưu…'], offline: ['busy', 'Ngoại tuyến'], error: ['err', 'Lỗi đồng bộ'],
    };
    const m = map[s];
    b.classList.toggle('hidden', !m);
    if (m) { b.className = 'sync-badge ' + m[0]; b.innerHTML = `<span>${m[1]}</span>`; b.title = msg || m[1]; }
  }
  renderCard();
}

/* ---------- Khởi động ---------- */
async function init() {
  if (!configured) { setStatus('off'); return; }
  try {
    const [a, au, fs] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
    fb = { ...a, ...au, ...fs };
    const fapp = fb.initializeApp(config);
    // initializeAuth (thay vì getAuth) để chạy ổn định trong WebView iOS (Capacitor)
    auth = fb.initializeAuth(fapp, { persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence] });
    try {
      db = fb.initializeFirestore(fapp, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
    } catch { db = fb.getFirestore(fapp); }
    fb.onAuthStateChanged(auth, onUser);
    addEventListener('online', () => {
      if (ready) setStatus('synced');
      else if (user && !unsubs.length) onUser(user); // lần trước kết nối thất bại vì mất mạng → thử lại
    });
    addEventListener('offline', () => { if (user) setStatus('offline'); });
  } catch (e) {
    console.warn('Không tải được Firebase', e);
    setStatus('error', 'Không tải được thư viện đồng bộ (đang offline?). Dữ liệu vẫn lưu trên máy và sẽ đồng bộ lần sau.');
  }
}

function stop() {
  unsubs.forEach(u => u()); unsubs = [];
  ready = gotMain = gotTx = false; lastKeys = {}; remoteTx = new Map(); lastTx = new Map(); inviteCode = null;
}

async function onUser(u) {
  stop(); user = u; hid = null;
  if (!u) { setStatus('signed-out'); return; }
  setStatus('connecting');
  try {
    const us = await fb.getDoc(fb.doc(db, 'users', u.uid));
    hid = us.exists() ? us.data().householdId : null;
    if (hid) {
      try { const hs = await fb.getDoc(hRef()); if (!hs.exists()) hid = null; }
      catch (e) { if (e.code === 'permission-denied') hid = null; else throw e; } // không còn là thành viên; lỗi mạng thì thử lại sau
    }
    if (!hid) await createHousehold();
    subscribe();
  } catch (e) {
    console.error(e);
    setStatus(navigator.onLine ? 'error' : 'offline', errText(e));
  }
}

/** Tạo sổ mới cho tài khoản, chuyển dữ liệu đang có trên máy lên đám mây. */
async function createHousehold() {
  const S = app.state;
  hid = fb.doc(fb.collection(db, 'households')).id;
  const code = randomCode();
  const data = { members: [user.uid], owner: user.uid, inviteCode: code, createdAt: fb.serverTimestamp() };
  DOC_KEYS.forEach(k => { data[k] = pick(S, k); });
  const batch = fb.writeBatch(db);
  batch.set(hRef(), data);
  batch.set(fb.doc(db, 'invites', code), { hid, createdAt: fb.serverTimestamp() });
  batch.set(fb.doc(db, 'users', user.uid), { householdId: hid, email: user.email || '' });
  await batch.commit();
  await commitOps(S.transactions.map(t => { const { id, ...rest } = t; return ['set', id, clean(rest)]; }), true);
  app.toast('☁️ Đã tạo sổ trên đám mây và chuyển dữ liệu lên');
}

function subscribe() {
  const S = app.state;
  // Nếu máy này có thay đổi chưa đẩy lên (sửa lúc mất mạng) thì máy thắng, ngược lại đám mây thắng.
  localWins = !!(S.ui.unsynced && S.ui.cloudUid === user.uid);

  unsubs.push(fb.onSnapshot(hRef(), { includeMetadataChanges: true }, snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    inviteCode = d.inviteCode; memberCount = (d.members || []).length;
    const patch = {};
    DOC_KEYS.forEach(k => {
      if (d[k] === undefined) return;
      const j = stable(d[k]);
      if (j !== lastKeys[k]) { lastKeys[k] = j; patch[k] = d[k]; }
    });
    const first = !gotMain; gotMain = true;
    if (Object.keys(patch).length && !(first && localWins)) app.applyRemote(patch);
    afterSnapshot(snap.metadata);
  }, onErr));

  unsubs.push(fb.onSnapshot(fb.collection(db, 'households', hid, 'tx'), { includeMetadataChanges: true }, snap => {
    let changed = false;
    snap.docChanges().forEach(ch => {
      const id = ch.doc.id;
      if (ch.type === 'removed') { if (remoteTx.delete(id)) { lastTx.delete(id); changed = true; } return; }
      const data = ch.doc.data(), j = stable(data);
      if (lastTx.get(id) !== j) { lastTx.set(id, j); remoteTx.set(id, data); changed = true; }
    });
    const first = !gotTx; gotTx = true;
    if ((changed || first) && !(first && localWins)) app.applyRemote({ transactions: [...remoteTx].map(([id, t]) => ({ id, ...t })) });
    afterSnapshot(snap.metadata);
  }, onErr));
}

function afterSnapshot(meta) {
  if (!ready && gotMain && gotTx) {
    ready = true;
    app.setUi({ cloudUid: user.uid });
    if (localWins) { doPush(); app.toast('☁️ Đã đẩy các thay đổi lúc offline lên đám mây'); }
    app.setUi({ unsynced: false });
    app.render();
  }
  if (!ready) return;
  if (!navigator.onLine) setStatus('offline');
  else setStatus(meta.hasPendingWrites ? 'pending' : 'synced');
}

function onErr(e) {
  console.error('Lỗi đồng bộ', e);
  setStatus('error', errText(e));
}

/* ---------- Đẩy thay đổi ---------- */
function doPush() {
  if (!ready || !hid) return;
  const S = app.state;
  const upd = {};
  DOC_KEYS.forEach(k => {
    const v = pick(S, k), j = stable(v);
    if (j !== lastKeys[k]) { upd[k] = v; lastKeys[k] = j; }
  });
  // Không await: khi offline Firestore xếp hàng và tự gửi khi có mạng
  if (Object.keys(upd).length) fb.updateDoc(hRef(), upd).catch(onErr);

  const ops = [];
  const local = new Map(S.transactions.map(t => [t.id, t]));
  local.forEach((t, id) => {
    const { id: _id, ...rest } = t;
    const v = clean(rest), j = stable(v);
    if (lastTx.get(id) !== j) { ops.push(['set', id, v]); lastTx.set(id, j); remoteTx.set(id, v); }
  });
  [...remoteTx.keys()].forEach(id => { if (!local.has(id)) { ops.push(['del', id]); lastTx.delete(id); remoteTx.delete(id); } });
  if (ops.length) commitOps(ops);
  if (Object.keys(upd).length || ops.length) setStatus(navigator.onLine ? 'pending' : 'offline');
}

function commitOps(ops, wait = false) {
  const jobs = [];
  for (let i = 0; i < ops.length; i += 450) { // giới hạn 500 thao tác / batch
    const batch = fb.writeBatch(db);
    ops.slice(i, i + 450).forEach(([op, id, v]) => {
      const ref = fb.doc(db, 'households', hid, 'tx', id);
      if (op === 'set') batch.set(ref, v); else batch.delete(ref);
    });
    jobs.push(batch.commit().catch(onErr));
  }
  return wait ? Promise.all(jobs) : undefined;
}

/* ---------- Hành động của người dùng ---------- */
async function run(fn) {
  if (busy) return; busy = true; renderCard();
  try { await fn(); } catch (e) { app.toast('⚠️ ' + errText(e)); }
  finally { busy = false; renderCard(); }
}
const creds = () => ({ email: ($('#cloudEmail')?.value || '').trim(), pass: $('#cloudPass')?.value || '' });

const ACTIONS = {
  signin: () => run(async () => { const { email, pass } = creds(); await fb.signInWithEmailAndPassword(auth, email, pass); app.toast('Đã đăng nhập'); }),
  signup: () => run(async () => {
    const { email, pass } = creds();
    if (!confirm('Tạo tài khoản mới và chuyển dữ liệu đang có trên máy này lên đám mây?')) return;
    await fb.createUserWithEmailAndPassword(auth, email, pass);
  }),
  reset: () => run(async () => {
    const { email } = creds();
    if (!email) throw new Error('Nhập email trước rồi bấm Quên mật khẩu');
    await fb.sendPasswordResetEmail(auth, email);
    app.toast('Đã gửi email đặt lại mật khẩu');
  }),
  signout: () => run(async () => {
    if (!confirm('Đăng xuất? Dữ liệu vẫn còn trên đám mây; máy này giữ một bản sao để xem offline.')) return;
    await fb.signOut(auth); app.setUi({ cloudUid: null, unsynced: false });
  }),
  copy: () => {
    const text = `Mã mời Chung Ví của mình: ${inviteCode}\nVào Cài đặt → Đồng bộ đám mây → Tham gia sổ chung và nhập mã này nhé!`;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => app.toast('Đã sao chép mã mời'), () => prompt('Sao chép mã mời:', inviteCode));
  },
  join: () => run(async () => {
    const code = ($('#cloudJoin')?.value || '').trim().toUpperCase().replace(/\s/g, '');
    if (code.length < 6) throw new Error('Mã mời gồm 8 ký tự');
    if (code === inviteCode) throw new Error('Đây là mã của chính sổ bạn đang dùng');
    if (!confirm('Tham gia sổ của người ấy? Dữ liệu trong sổ hiện tại của bạn sẽ không còn hiển thị trên máy này.')) return;
    const inv = await fb.getDoc(fb.doc(db, 'invites', code));
    if (!inv.exists()) throw new Error('Mã mời không đúng');
    const newHid = inv.data().hid;
    await fb.updateDoc(fb.doc(db, 'households', newHid), { members: fb.arrayUnion(user.uid) });
    await fb.setDoc(fb.doc(db, 'users', user.uid), { householdId: newHid, email: user.email || '' });
    stop(); hid = newHid;
    app.setUi({ unsynced: false, me: 'p2' });
    setStatus('connecting'); subscribe();
    app.toast('💞 Đã tham gia sổ chung!');
  }),
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-cloud]');
  if (el && ACTIONS[el.dataset.cloud]) { e.preventDefault(); ACTIONS[el.dataset.cloud](); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'cloudPass') { e.preventDefault(); ACTIONS.signin(); }
  if (e.target.id === 'cloudJoin') { e.preventDefault(); ACTIONS.join(); }
});

/* ---------- Giao diện thẻ "Đồng bộ đám mây" trong Cài đặt ---------- */
function renderCard() {
  const el = $('#cloudCard');
  if (!el) return;
  const head = `<div class="card-head"><h3>☁️ Đồng bộ đám mây</h3>${status !== 'off' ? `<span class="sync-badge ${{ synced: 'ok', error: 'err', 'signed-out': '' }[status] ?? 'busy'}">${esc($('#syncBadge')?.textContent || '')}</span>` : ''}</div>`;
  const dis = busy ? 'disabled' : '';

  if (status === 'off') {
    el.innerHTML = head + `<p class="muted small" style="margin:0">Hiện dữ liệu chỉ lưu trên thiết bị này. Để đăng nhập, dùng chung sổ với người ấy trên nhiều thiết bị
      và không lo mất dữ liệu, hãy cấu hình Firebase trong <code>www/js/firebase-config.js</code> (xem hướng dẫn <b>DEPLOY.md</b>).</p>`;
    return;
  }
  if (status === 'loading' || (!user && status === 'error')) {
    el.innerHTML = head + `<p class="muted small" style="margin:0">${esc(statusMsg || 'Đang tải…')}</p>`;
    return;
  }
  if (!user) {
    el.innerHTML = head + `<p class="muted small" style="margin-top:0">Đăng nhập để lưu dữ liệu lên đám mây, dùng trên mọi thiết bị và chia sẻ sổ với người ấy.</p>
      <div class="form-grid">
        <div class="field"><label for="cloudEmail">Email</label><input class="input" id="cloudEmail" type="email" autocomplete="email" placeholder="ban@email.com"></div>
        <div class="field"><label for="cloudPass">Mật khẩu</label><input class="input" id="cloudPass" type="password" autocomplete="current-password" placeholder="Ít nhất 6 ký tự"></div>
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn primary" data-cloud="signin" ${dis}>Đăng nhập</button>
        <button class="btn" data-cloud="signup" ${dis}>Tạo tài khoản</button>
        <button class="btn ghost" data-cloud="reset" ${dis}>Quên mật khẩu</button></div>
      <p class="hint">Tạo tài khoản: dữ liệu đang có trên máy sẽ được chuyển lên đám mây. Đăng nhập tài khoản đã có: dữ liệu đám mây sẽ thay cho dữ liệu trên máy.</p>`;
    return;
  }
  const couple = app.state.settings.mode === 'couple';
  el.innerHTML = head + `<div class="grid grid-2e">
      <div><div class="small">Đang đăng nhập: <b>${esc(user.email)}</b></div>
        <div class="small muted">${memberCount > 1 ? `💞 Sổ chung của ${memberCount} người` : 'Sổ riêng (chưa có ai tham gia)'}</div>
        ${statusMsg && status === 'error' ? `<div class="small neg">${esc(statusMsg)}</div>` : ''}
        <div class="btn-row" style="margin-top:12px"><button class="btn" data-cloud="signout" ${dis}>Đăng xuất</button></div></div>
      ${couple ? `<div>
        ${inviteCode ? `<div class="lbl">Mã mời người ấy vào sổ chung</div>
          <div style="display:flex;align-items:center;gap:10px;margin:4px 0 12px"><span class="invite-code">${esc(inviteCode)}</span><button class="btn sm" data-cloud="copy">Sao chép</button></div>` : ''}
        <div class="lbl">Hoặc tham gia sổ của người ấy</div>
        <div style="display:flex;gap:8px;margin-top:6px"><input class="input" id="cloudJoin" maxlength="10" placeholder="Nhập mã 8 ký tự" style="text-transform:uppercase">
          <button class="btn primary" data-cloud="join" ${dis}>Tham gia</button></div></div>` : ''}
    </div>`;
}

/* ---------- Đăng ký với app ---------- */
window.chungviCloud = {
  isReady: () => ready,
  isSignedIn: () => !!user,
  push: () => doPush(),
  renderCard,
};
renderCard();
setStatus(status);
init();
