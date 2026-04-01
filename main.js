import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDatabase, ref, set, onDisconnect,
  onChildAdded, onChildChanged, onChildRemoved, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ===== FIREBASE =====
const firebaseConfig = {
  apiKey: "AIzaSyAfx9IxuT4hW7h24wY6IZ0TGW1pxqe5N-M",
  authDomain: "personal-station-810e7.firebaseapp.com",
  projectId: "personal-station-810e7",
  storageBucket: "personal-station-810e7.firebasestorage.app",
  messagingSenderId: "16967737691",
  appId: "1:16967737691:web:53834006c3a385a7b63a7e",
  databaseURL: "https://personal-station-810e7-default-rtdb.europe-west1.firebasedatabase.app"
};
const firebaseApp = initializeApp(firebaseConfig);
const db   = getFirestore(firebaseApp);
const rtdb = getDatabase(firebaseApp);

// ===== CONSTANTS =====
const ADMIN_PASSWORD = "1215";
const CURSOR_COLORS  = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899'];
const STICKY_COLORS  = ['#fef08a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa','#fbcfe8','#a5f3fc'];
const NOTE_W = 180, NOTE_H = 120, PAD = 32;

// ===== MY IDENTITY =====
const myId    = Math.random().toString(36).slice(2, 10);
const myColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

// ===== ADMIN =====
let isAdmin = false;

// ===== BOARD CLEANUP =====
let boardUnsub = null; // firestore listener to cancel on close

// ===== DESKTOP APP SYSTEM =====
const appConfig = {
  notebook: { title: '📌 留言板', tpl: 'tpl-notebook', w: 820, h: 560 },
  about:    { title: '👤 关于我',  tpl: 'tpl-about',    w: 360, h: 420 },
  projects: { title: '💼 我的项目',tpl: 'tpl-projects',  w: 440, h: 480 },
  contact:  { title: '✉️ 联系我', tpl: 'tpl-contact',   w: 360, h: 340 },
};

let zTop = 100;
const openWindows = {};

function openApp(appId) {
  if (openWindows[appId]) { focusWin(openWindows[appId]); return; }
  const cfg = appConfig[appId];
  if (!cfg) return;
  const tpl = document.getElementById(cfg.tpl);
  if (!tpl) return;

  const win = document.createElement('div');
  win.className = 'window';
  win.style.width  = cfg.w + 'px';
  win.style.height = cfg.h + 'px';
  win.style.zIndex = ++zTop;

  const dw = window.innerWidth, dh = window.innerHeight - 108;
  win.style.left = Math.max(20, (dw - cfg.w) / 2 + (Math.random() - .5) * 80) + 'px';
  win.style.top  = Math.max(10, (dh - cfg.h) / 2 + (Math.random() - .5) * 60) + 'px';

  const tb = document.createElement('div');
  tb.className = 'win-titlebar';
  tb.innerHTML = `
    <div class="win-dots">
      <div class="win-dot red"    data-action="close"></div>
      <div class="win-dot yellow"></div>
      <div class="win-dot green"></div>
    </div>
    <div class="win-title">${cfg.title}</div>`;

  win.appendChild(tb);
  win.appendChild(tpl.content.cloneNode(true));
  document.getElementById('windows').appendChild(win);
  openWindows[appId] = win;

  const dockItem = document.querySelector(`.dock-item[data-app="${appId}"]`);
  if (dockItem) dockItem.classList.add('open');

  tb.querySelector('[data-action="close"]').addEventListener('click', () => closeApp(appId));
  win.addEventListener('mousedown', () => focusWin(win));
  makeDraggable(win, tb);

  if (appId === 'notebook') initBoard(win);
}

function closeApp(appId) {
  const win = openWindows[appId];
  if (!win) return;
  win.style.animation = 'winClose .15s ease forwards';
  win.addEventListener('animationend', () => win.remove(), { once: true });
  delete openWindows[appId];
  const d = document.querySelector(`.dock-item[data-app="${appId}"]`);
  if (d) d.classList.remove('open');
  if (appId === 'notebook') {
    if (boardUnsub) { boardUnsub(); boardUnsub = null; }
    notesData = {}; noteEls = {}; lineEls = {};
    placedRects = [];
    noteCount = 0;
    brdScale = 1; brdPanX = 0; brdPanY = 0;
  }
}

function focusWin(win) { win.style.zIndex = ++zTop; }

function makeDraggable(win, handle) {
  let dragging = false, ox = 0, oy = 0;
  handle.addEventListener('mousedown', e => {
    if (e.target.classList.contains('win-dot')) return;
    dragging = true;
    ox = e.clientX - win.offsetLeft;
    oy = e.clientY - win.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    win.style.left = Math.max(0, Math.min(window.innerWidth  - win.offsetWidth,  e.clientX - ox)) + 'px';
    win.style.top  = Math.max(0, Math.min(window.innerHeight - win.offsetHeight, e.clientY - oy)) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}

// ===== DESKTOP ICONS =====
document.querySelectorAll('.icon').forEach(icon => {
  let clicks = 0;
  icon.addEventListener('click', () => {
    clicks++;
    if (clicks === 1) setTimeout(() => { clicks = 0; }, 300);
    if (clicks >= 2) { openApp(icon.dataset.app); clicks = 0; }
  });
});
document.querySelectorAll('.dock-item').forEach(item => {
  item.addEventListener('click', () => openApp(item.dataset.app));
});

// ===== CLOCK =====
function tick() {
  const el = document.getElementById('menuClock');
  if (el) el.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
tick(); setInterval(tick, 10000);

// ===== BOARD INIT =====
let brdScale = 1, brdPanX = 0, brdPanY = 0;
let brdIsPanning = false, brdPanSX = 0, brdPanSY = 0;
let notesData = {}, noteEls = {}, lineEls = {};
let noteCount = 0;
let placedRects = [];
let dragThrottle = 0;

function initBoard(win) {

  const wrap       = win.querySelector('#brd-wrap');
  const canvasEl   = win.querySelector('#brd-canvas');
  const linesSvg   = win.querySelector('#brd-lines');
  const cursorsEl  = win.querySelector('#brd-cursors');
  const nameInp    = win.querySelector('#brd-name');
  const textInp    = win.querySelector('#brd-text');
  const sendBtn    = win.querySelector('#brd-send');
  const adminBtn   = win.querySelector('#brd-admin-btn');
  const countEl    = win.querySelector('#brd-count');
  const onlineEl   = win.querySelector('#brd-online');

  // transform
  function applyTransform() {
    canvasEl.style.transform = `translate(${brdPanX}px,${brdPanY}px) scale(${brdScale})`;
    win.querySelector('#brd-zoom-label').textContent = Math.round(brdScale * 100) + '%';
    updateAllLines(linesSvg, canvasEl);
  }

  function zoomTo(s, cx, cy) {
    const ns = Math.min(2.5, Math.max(0.1, s));
    const r  = ns / brdScale;
    brdPanX = cx - r * (cx - brdPanX);
    brdPanY = cy - r * (cy - brdPanY);
    brdScale = ns;
    applyTransform();
  }

  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rc = wrap.getBoundingClientRect();
    zoomTo(brdScale * (e.deltaY > 0 ? 0.9 : 1.1), e.clientX - rc.left, e.clientY - rc.top);
  }, { passive: false });

  win.querySelector('#brd-zoom-in').addEventListener('click',    () => zoomTo(brdScale * 1.2, wrap.clientWidth/2, wrap.clientHeight/2));
  win.querySelector('#brd-zoom-out').addEventListener('click',   () => zoomTo(brdScale * 0.8, wrap.clientWidth/2, wrap.clientHeight/2));
  win.querySelector('#brd-zoom-reset').addEventListener('click', () => { brdScale=1; brdPanX=0; brdPanY=0; applyTransform(); });

  // pan
  wrap.addEventListener('mousedown', e => {
    if (e.target.closest('.sticky') || e.target.closest('.cursor-wrap')) return;
    brdIsPanning = true;
    brdPanSX = e.clientX - brdPanX;
    brdPanSY = e.clientY - brdPanY;
    wrap.classList.add('grabbing');
  });
  document.addEventListener('mousemove', e => {
    if (!brdIsPanning) return;
    brdPanX = e.clientX - brdPanSX;
    brdPanY = e.clientY - brdPanSY;
    applyTransform();
  });
  document.addEventListener('mouseup', () => { brdIsPanning = false; wrap.classList.remove('grabbing'); });

  // cursor presence
  const myRef = ref(rtdb, `cursors/${myId}`);
  set(myRef, { color: myColor, x: -1, y: -1, active: false });
  onDisconnect(myRef).remove();

  const cursorEls = {};
  let lastSend = 0;

  wrap.addEventListener('mousemove', e => {
    const now = Date.now();
    if (now - lastSend < 50) return;
    lastSend = now;
    const rc = wrap.getBoundingClientRect();
    set(myRef, { color: myColor, x: (e.clientX - rc.left) / rc.width, y: (e.clientY - rc.top) / rc.height, active: true });
  });
  wrap.addEventListener('mouseleave', () => set(myRef, { color: myColor, x: -1, y: -1, active: false }));

  const cursorsRef = ref(rtdb, 'cursors');
  function upsertCursor(uid, data) {
    if (uid === myId) return;
    let el = cursorEls[uid];
    if (!el) {
      el = document.createElement('div');
      el.className = 'cursor-wrap';
      el.innerHTML = `
        <svg class="cursor-svg" width="18" height="22" viewBox="0 0 20 24">
          <path d="M0 0L0 20L5.5 14.5L9 22L11.5 21L8 13.5L15 13.5L0 0Z" fill="${data.color}" stroke="white" stroke-width="1.5"/>
        </svg>
        <div class="cursor-name" style="background:${data.color}">访客</div>`;
      cursorsEl.appendChild(el);
      cursorEls[uid] = el;
    }
    if (!data.active || data.x < 0) { el.style.opacity = '0'; return; }
    const rc = wrap.getBoundingClientRect();
    el.style.opacity = '1';
    el.style.left = (data.x * rc.width)  + 'px';
    el.style.top  = (data.y * rc.height) + 'px';
  }

  onChildAdded(cursorsRef,   s => upsertCursor(s.key, s.val()));
  onChildChanged(cursorsRef, s => upsertCursor(s.key, s.val()));
  onChildRemoved(cursorsRef, s => { const el = cursorEls[s.key]; if (el) { el.remove(); delete cursorEls[s.key]; } });

  onValue(ref(rtdb, 'cursors'), snap => {
    const n = snap.exists() ? Object.keys(snap.val()).length : 0;
    if (onlineEl) onlineEl.textContent = n + ' 人在线';
  });

  // render notes
  function renderNote(docId, data) {
    const existing = noteEls[docId];
    if (existing) {
      existing.style.left = data.x + 'px';
      existing.style.top  = data.y + 'px';
      notesData[docId] = data;
      updateLine(docId, data, linesSvg, canvasEl);
      return;
    }
    notesData[docId] = data;
    const isReply = !!data.replyTo;
    const el = document.createElement('div');
    el.className = 'sticky' + (isReply ? ' is-reply' : '');
    el.dataset.id = docId;
    el.style.cssText = `background:${data.color||STICKY_COLORS[0]};left:${data.x||0}px;top:${data.y||0}px;z-index:1`;

    const time = data.createdAt?.toDate
      ? data.createdAt.toDate().toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
      : '刚刚';

    el.innerHTML = `
      <div class="sticky-name">${escHtml(data.name||'匿名')}</div>
      <div class="sticky-text">${escHtml(data.text)}</div>
      <div class="sticky-time">${time}</div>
      <div class="sticky-actions">
        <button class="sticky-reply-btn">💬 回复</button>
        <button class="sticky-del-btn">🗑 删除</button>
      </div>`;

    makeStickyDraggable(el, docId, canvasEl, linesSvg);

    el.querySelector('.sticky-reply-btn').addEventListener('click', e => {
      e.stopPropagation();
      openReplyModal(docId, data);
    });
    el.querySelector('.sticky-del-btn').addEventListener('click', async e => {
      e.stopPropagation();
      if (!isAdmin) return;
      if (!confirm('确认删除？')) return;
      await deleteDoc(doc(db, 'messages', docId)).catch(console.error);
    });

    canvasEl.appendChild(el);
    noteEls[docId] = el;
    noteCount++;
    if (countEl) countEl.textContent = noteCount + ' 条留言';

    if (isReply && data.replyTo) drawLine(docId, data, linesSvg, canvasEl);
  }

  function removeNote(docId) {
    const el = noteEls[docId];
    if (el) {
      el.style.transition = 'transform .2s,opacity .2s';
      el.style.transform  = 'scale(0.6)';
      el.style.opacity    = '0';
      setTimeout(() => el.remove(), 220);
      delete noteEls[docId]; delete notesData[docId];
    }
    if (lineEls[docId]) { lineEls[docId].remove(); delete lineEls[docId]; }
    noteCount = Math.max(0, noteCount - 1);
    if (countEl) countEl.textContent = noteCount + ' 条留言';
  }

  // firestore
  const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
  boardUnsub = onSnapshot(q, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added' || change.type === 'modified') renderNote(change.doc.id, change.doc.data());
      if (change.type === 'removed') removeNote(change.doc.id);
    });
  });

  // send
  async function sendNote() {
    const name = nameInp.value.trim() || '匿名';
    const text = textInp.value.trim();
    if (!text) { textInp.focus(); return; }
    sendBtn.disabled = true; sendBtn.textContent = '发送中...';
    const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
    const pos   = findPosition(false, wrap, brdScale, brdPanX, brdPanY, placedRects);
    try {
      await addDoc(collection(db, 'messages'), { name, text, color, x: pos.x, y: pos.y, z: 1, createdAt: serverTimestamp() });
      nameInp.value = ''; textInp.value = '';
      brdPanX = wrap.clientWidth/2  - (pos.x + NOTE_W/2) * brdScale;
      brdPanY = wrap.clientHeight/2 - (pos.y + NOTE_H/2) * brdScale;
      applyTransform();
    } catch(err) { alert('发送失败'); console.error(err); }
    sendBtn.disabled = false; sendBtn.textContent = '发送';
  }
  sendBtn.addEventListener('click', sendNote);
  textInp.addEventListener('keydown', e => { if (e.key === 'Enter') sendNote(); });

  // admin
  adminBtn.addEventListener('click', () => {
    if (isAdmin) {
      isAdmin = false; adminBtn.textContent = '🔒'; adminBtn.classList.remove('active');
      document.body.classList.remove('admin-mode'); return;
    }
    document.getElementById('admin-pass').value = '';
    document.getElementById('admin-error').textContent = '';
    document.getElementById('admin-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('admin-pass').focus(), 50);
  });

  applyTransform();
}

// ===== STICKY DRAG =====
function makeStickyDraggable(el, docId, canvasEl, linesSvg) {
  let dragging = false, ox = 0, oy = 0;
  el.addEventListener('mousedown', e => {
    if (e.target.classList.contains('sticky-reply-btn') || e.target.classList.contains('sticky-del-btn')) return;
    dragging = true;
    el.style.zIndex = 999;
    ox = e.clientX - parseFloat(el.style.left) * brdScale - brdPanX;
    oy = e.clientY - parseFloat(el.style.top)  * brdScale - brdPanY;
    e.stopPropagation(); e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const nx = (e.clientX - brdPanX - ox) / brdScale;
    const ny = (e.clientY - brdPanY - oy) / brdScale;
    el.style.left = nx + 'px'; el.style.top = ny + 'px';
    if (notesData[docId]) { notesData[docId].x = nx; notesData[docId].y = ny; }
    updateAllLines(linesSvg, canvasEl);
    const now = Date.now();
    if (now - dragThrottle > 100) {
      dragThrottle = now;
      updateDoc(doc(db, 'messages', docId), { x: nx, y: ny }).catch(() => {});
    }
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return; dragging = false;
    const nx = parseFloat(el.style.left), ny = parseFloat(el.style.top);
    updateDoc(doc(db, 'messages', docId), { x: nx, y: ny }).catch(() => {});
  });
}

// ===== LINES =====
function noteCenter(docId, canvasEl) {
  const d = notesData[docId];
  if (!d) return null;
  const el = noteEls[docId];
  const w = el ? el.offsetWidth  : NOTE_W;
  const h = el ? el.offsetHeight : NOTE_H;
  return {
    x: d.x * brdScale + brdPanX + w * brdScale / 2,
    y: d.y * brdScale + brdPanY + h * brdScale / 2,
  };
}

function drawLine(docId, data, linesSvg, canvasEl) {
  if (!data.replyTo) return;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.classList.add('connector-line');
  linesSvg.appendChild(path);
  lineEls[docId] = path;
  updateLine(docId, data, linesSvg, canvasEl);
}

function updateLine(docId, data, linesSvg, canvasEl) {
  const path = lineEls[docId];
  if (!path || !data.replyTo) return;
  const from = noteCenter(data.replyTo, canvasEl);
  const to   = noteCenter(docId, canvasEl);
  if (!from || !to) return;
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2 - 40;
  path.setAttribute('d', `M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`);
}

function updateAllLines(linesSvg, canvasEl) {
  for (const [docId, data] of Object.entries(notesData)) {
    if (data.replyTo) updateLine(docId, data, linesSvg, canvasEl);
  }
}

// ===== FIND POSITION =====
function findPosition(isReply, wrap, scale, panX, panY, placed) {
  const vw = wrap.clientWidth, vh = wrap.clientHeight;
  const nw = isReply ? 150 : NOTE_W, nh = isReply ? 100 : NOTE_H;
  const cx = (vw / 2 - panX) / scale, cy = (vh / 2 - panY) / scale;
  const step = nw + PAD;
  for (let ring = 0; ring < 50; ring++) {
    const positions = ring === 0 ? [{ x: cx - nw/2, y: cy - nh/2 }] : [];
    if (ring > 0) {
      for (let c = -ring; c <= ring; c++) {
        positions.push({ x: cx + c*step - nw/2, y: cy - ring*(nh+PAD) - nh/2 });
        positions.push({ x: cx + c*step - nw/2, y: cy + ring*(nh+PAD) - nh/2 });
      }
      for (let r = -ring+1; r <= ring-1; r++) {
        positions.push({ x: cx - ring*step - nw/2, y: cy + r*(nh+PAD) - nh/2 });
        positions.push({ x: cx + ring*step - nw/2, y: cy + r*(nh+PAD) - nh/2 });
      }
    }
    for (const p of positions) {
      const ok = !placed.some(r => p.x < r.x+r.w+PAD && p.x+nw+PAD > r.x && p.y < r.y+r.h+PAD && p.y+nh+PAD > r.y);
      if (ok) { placed.push({ x: p.x, y: p.y, w: nw, h: nh }); return p; }
    }
  }
  const fb = { x: cx + Math.random()*300-150, y: cy + Math.random()*300-150 };
  placed.push({ x: fb.x, y: fb.y, w: nw, h: nh });
  return fb;
}

// ===== REPLY MODAL =====
let replyTargetId = null;

function openReplyModal(docId, data) {
  replyTargetId = docId;
  document.getElementById('reply-original').textContent = `"${data.text}"`;
  document.getElementById('reply-name').value = '';
  document.getElementById('reply-text').value = '';
  document.getElementById('reply-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('reply-text').focus(), 50);
}

document.getElementById('reply-cancel').addEventListener('click', () => {
  document.getElementById('reply-modal').style.display = 'none';
  replyTargetId = null;
});

document.getElementById('reply-confirm').addEventListener('click', async () => {
  const name = document.getElementById('reply-name').value.trim() || '匿名';
  const text = document.getElementById('reply-text').value.trim();
  if (!text) return;
  const btn = document.getElementById('reply-confirm');
  btn.disabled = true; btn.textContent = '发送中...';
  const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
  // find position near parent
  const parent = notesData[replyTargetId];
  const pos = parent
    ? { x: parent.x + NOTE_W + PAD, y: parent.y }
    : { x: 100, y: 100 };
  try {
    await addDoc(collection(db, 'messages'), {
      name, text, color, x: pos.x, y: pos.y, z: 1,
      replyTo: replyTargetId, createdAt: serverTimestamp(),
    });
    document.getElementById('reply-modal').style.display = 'none';
    replyTargetId = null;
  } catch(err) { alert('发送失败'); console.error(err); }
  btn.disabled = false; btn.textContent = '发送回复';
});

// ===== ADMIN MODAL =====
document.getElementById('admin-cancel').addEventListener('click', () => {
  document.getElementById('admin-modal').style.display = 'none';
});
document.getElementById('admin-confirm').addEventListener('click', () => {
  const pass = document.getElementById('admin-pass').value;
  if (pass === ADMIN_PASSWORD) {
    isAdmin = true;
    document.getElementById('admin-modal').style.display = 'none';
    document.body.classList.add('admin-mode');
    const btn = document.querySelector('#brd-admin-btn');
    if (btn) { btn.textContent = '🔑'; btn.classList.add('active'); }
  } else {
    document.getElementById('admin-error').textContent = '密码错误，请重试';
  }
});
document.getElementById('admin-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('admin-confirm').click();
});

// ===== UTILS =====
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
