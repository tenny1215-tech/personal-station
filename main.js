import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===== FIREBASE =====
const firebaseConfig = {
  apiKey: "AIzaSyAfx9IxuT4hW7h24wY6IZ0TGW1pxqe5N-M",
  authDomain: "personal-station-810e7.firebaseapp.com",
  projectId: "personal-station-810e7",
  storageBucket: "personal-station-810e7.firebasestorage.app",
  messagingSenderId: "16967737691",
  appId: "1:16967737691:web:53834006c3a385a7b63a7e"
};
const db = getFirestore(initializeApp(firebaseConfig));

// ===== CONFIG =====
const ADMIN_PASS   = "1215";
const COLORS       = ['#fef08a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa','#fbcfe8','#a5f3fc','#d9f99d','#fde68a'];
const NOTE_W       = 160;
const NOTE_H       = 110;
const PAD          = 28;

// ===== STATE =====
let scale    = 1;
let panX     = 0;
let panY     = 0;
let isAdmin  = false;

const notesData   = {};  // docId -> data
const noteEls     = {};  // docId -> el
const lineEls     = {};  // docId -> SVG path
const placed      = [];  // for layout engine
let   noteCount   = 0;
let   dragThrottle = 0;

// ===== ELEMENTS =====
const wrap     = document.getElementById('canvas-wrap');
const canvasEl = document.getElementById('canvas');
const linesSvg = document.getElementById('lines-svg');
const countEl  = document.getElementById('note-count');

// ===== TRANSFORM =====
function applyT() {
  canvasEl.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  document.getElementById('zoom-label').textContent = Math.round(scale * 100) + '%';
  updateAllLines();
}

function zoomTo(s, cx, cy) {
  const ns = Math.min(3, Math.max(0.1, s));
  const r  = ns / scale;
  panX = cx - r * (cx - panX);
  panY = cy - r * (cy - panY);
  scale = ns;
  applyT();
}

// ===== DESKTOP: mouse pan & zoom =====
let panning = false, pStartX = 0, pStartY = 0;

wrap.addEventListener('mousedown', e => {
  if (e.target.closest('.sticky')) return;
  panning = true;
  pStartX = e.clientX - panX;
  pStartY = e.clientY - panY;
  wrap.classList.add('grabbing');
});
document.addEventListener('mousemove', e => {
  if (!panning) return;
  panX = e.clientX - pStartX;
  panY = e.clientY - pStartY;
  applyT();
});
document.addEventListener('mouseup', () => { panning = false; wrap.classList.remove('grabbing'); });

wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const rc = wrap.getBoundingClientRect();
  zoomTo(scale * (e.deltaY > 0 ? 0.92 : 1.08), e.clientX - rc.left, e.clientY - rc.top);
}, { passive: false });

document.getElementById('zoom-in').addEventListener('click',    () => zoomTo(scale * 1.2, wrap.clientWidth/2, wrap.clientHeight/2));
document.getElementById('zoom-out').addEventListener('click',   () => zoomTo(scale * 0.8, wrap.clientWidth/2, wrap.clientHeight/2));
document.getElementById('zoom-reset').addEventListener('click', () => { scale=1; panX=0; panY=0; applyT(); });

// ===== MOBILE: touch pan & pinch-zoom =====
let touches = {};
let lastPinchDist = null;

wrap.addEventListener('touchstart', e => {
  if (e.target.closest('.sticky')) return;
  e.preventDefault();
  Array.from(e.changedTouches).forEach(t => { touches[t.identifier] = { x: t.clientX, y: t.clientY }; });
  if (Object.keys(touches).length === 1) {
    const t = e.touches[0];
    pStartX = t.clientX - panX;
    pStartY = t.clientY - panY;
  }
}, { passive: false });

wrap.addEventListener('touchmove', e => {
  if (e.target.closest('.sticky')) return;
  e.preventDefault();
  Array.from(e.changedTouches).forEach(t => { touches[t.identifier] = { x: t.clientX, y: t.clientY }; });
  const ids = Object.keys(touches);
  if (ids.length === 1) {
    const t = e.touches[0];
    panX = t.clientX - pStartX;
    panY = t.clientY - pStartY;
    applyT();
  } else if (ids.length === 2) {
    const [a, b] = ids.map(id => touches[id]);
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastPinchDist) {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rc = wrap.getBoundingClientRect();
      zoomTo(scale * (dist / lastPinchDist), cx - rc.left, cy - rc.top);
    }
    lastPinchDist = dist;
  }
}, { passive: false });

wrap.addEventListener('touchend', e => {
  Array.from(e.changedTouches).forEach(t => { delete touches[t.identifier]; });
  if (Object.keys(touches).length < 2) lastPinchDist = null;
}, { passive: false });

// ===== LAYOUT ENGINE =====
function findPos() {
  const cx = (wrap.clientWidth  / 2 - panX) / scale;
  const cy = (wrap.clientHeight / 2 - panY) / scale;
  const step = NOTE_W + PAD;
  for (let ring = 0; ring < 60; ring++) {
    const pos = ring === 0 ? [{ x: cx - NOTE_W/2, y: cy - NOTE_H/2 }] : [];
    if (ring > 0) {
      for (let c = -ring; c <= ring; c++) {
        pos.push({ x: cx + c*step - NOTE_W/2, y: cy - ring*(NOTE_H+PAD) - NOTE_H/2 });
        pos.push({ x: cx + c*step - NOTE_W/2, y: cy + ring*(NOTE_H+PAD) - NOTE_H/2 });
      }
      for (let r = -ring+1; r <= ring-1; r++) {
        pos.push({ x: cx - ring*step - NOTE_W/2, y: cy + r*(NOTE_H+PAD) - NOTE_H/2 });
        pos.push({ x: cx + ring*step - NOTE_W/2, y: cy + r*(NOTE_H+PAD) - NOTE_H/2 });
      }
    }
    for (const p of pos) {
      if (!placed.some(r => p.x < r.x+r.w+PAD && p.x+NOTE_W+PAD > r.x && p.y < r.y+r.h+PAD && p.y+NOTE_H+PAD > r.y)) {
        placed.push({ x: p.x, y: p.y, w: NOTE_W, h: NOTE_H });
        return p;
      }
    }
  }
  return { x: cx + Math.random()*200-100, y: cy + Math.random()*200-100 };
}

function posNearParent(parentId) {
  const p = notesData[parentId];
  if (!p) return findPos();
  const x = p.x + NOTE_W + PAD;
  const y = p.y;
  placed.push({ x, y, w: NOTE_W, h: NOTE_H });
  return { x, y };
}

// ===== RENDER NOTE =====
function renderNote(docId, data) {
  // update position if already exists
  if (noteEls[docId]) {
    noteEls[docId].style.left = data.x + 'px';
    noteEls[docId].style.top  = data.y + 'px';
    notesData[docId] = data;
    updateLine(docId);
    return;
  }

  notesData[docId] = data;
  const isReply = !!data.replyTo;

  const el = document.createElement('div');
  el.className = 'sticky' + (isReply ? ' is-reply' : '');
  el.dataset.id = docId;
  el.style.background = data.color || COLORS[0];
  el.style.left = (data.x || 0) + 'px';
  el.style.top  = (data.y || 0) + 'px';
  el.style.zIndex = 1;

  const time = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleString('zh-CN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : '';

  el.innerHTML = `
    <div class="sticky-name">${esc(data.name || '匿名')}</div>
    <div class="sticky-text">${esc(data.text)}</div>
    ${time ? `<div class="sticky-time">${time}</div>` : ''}
    <div class="sticky-actions">
      <button class="btn-reply">💬</button>
      <button class="btn-delete">🗑</button>
    </div>
  `;

  // reply
  el.querySelector('.btn-reply').addEventListener('click', e => {
    e.stopPropagation();
    openReply(docId, data);
  });

  // delete (admin only via CSS)
  el.querySelector('.btn-delete').addEventListener('click', async e => {
    e.stopPropagation();
    if (!isAdmin || !confirm('确认删除这条留言？')) return;
    await deleteDoc(doc(db, 'messages', docId)).catch(console.error);
  });

  // drag (mouse)
  makeDraggable(el, docId);

  // drag (touch)
  makeTouchDraggable(el, docId);

  canvasEl.appendChild(el);
  noteEls[docId] = el;
  noteCount++;
  if (countEl) countEl.textContent = noteCount + ' 条留言';

  // draw line for replies
  if (isReply && data.replyTo) drawLine(docId);
}

function removeNote(docId) {
  const el = noteEls[docId];
  if (el) {
    el.style.transition = 'transform .2s,opacity .2s';
    el.style.transform  = 'scale(.6)';
    el.style.opacity    = '0';
    setTimeout(() => el.remove(), 220);
    delete noteEls[docId];
    delete notesData[docId];
  }
  if (lineEls[docId]) { lineEls[docId].remove(); delete lineEls[docId]; }
  noteCount = Math.max(0, noteCount - 1);
  if (countEl) countEl.textContent = noteCount + ' 条留言';
}

// ===== DRAG MOUSE =====
function makeDraggable(el, docId) {
  let down = false, ox = 0, oy = 0;
  el.addEventListener('mousedown', e => {
    if (e.target.classList.contains('btn-reply') || e.target.classList.contains('btn-delete')) return;
    down = true;
    el.style.zIndex = 500;
    ox = e.clientX - parseFloat(el.style.left) * scale - panX;
    oy = e.clientY - parseFloat(el.style.top)  * scale - panY;
    e.stopPropagation();
  });
  document.addEventListener('mousemove', e => {
    if (!down) return;
    const nx = (e.clientX - panX - ox) / scale;
    const ny = (e.clientY - panY - oy) / scale;
    el.style.left = nx + 'px';
    el.style.top  = ny + 'px';
    if (notesData[docId]) { notesData[docId].x = nx; notesData[docId].y = ny; }
    updateAllLines();
    const now = Date.now();
    if (now - dragThrottle > 120) {
      dragThrottle = now;
      updateDoc(doc(db, 'messages', docId), { x: nx, y: ny }).catch(() => {});
    }
  });
  document.addEventListener('mouseup', () => {
    if (!down) return;
    down = false;
    const nx = parseFloat(el.style.left), ny = parseFloat(el.style.top);
    updateDoc(doc(db, 'messages', docId), { x: nx, y: ny }).catch(() => {});
  });
}

// ===== DRAG TOUCH =====
function makeTouchDraggable(el, docId) {
  let tid = null, ox = 0, oy = 0;
  el.addEventListener('touchstart', e => {
    if (e.target.classList.contains('btn-reply') || e.target.classList.contains('btn-delete')) return;
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    const t = e.touches[0];
    tid = t.identifier;
    el.style.zIndex = 500;
    ox = t.clientX - parseFloat(el.style.left) * scale - panX;
    oy = t.clientY - parseFloat(el.style.top)  * scale - panY;
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    if (tid === null) return;
    const t = Array.from(e.touches).find(tt => tt.identifier === tid);
    if (!t) return;
    e.stopPropagation();
    e.preventDefault();
    const nx = (t.clientX - panX - ox) / scale;
    const ny = (t.clientY - panY - oy) / scale;
    el.style.left = nx + 'px';
    el.style.top  = ny + 'px';
    if (notesData[docId]) { notesData[docId].x = nx; notesData[docId].y = ny; }
    updateAllLines();
    const now = Date.now();
    if (now - dragThrottle > 150) {
      dragThrottle = now;
      updateDoc(doc(db, 'messages', docId), { x: nx, y: ny }).catch(() => {});
    }
  }, { passive: false });

  el.addEventListener('touchend', e => {
    if (tid === null) return;
    tid = null;
    const nx = parseFloat(el.style.left), ny = parseFloat(el.style.top);
    updateDoc(doc(db, 'messages', docId), { x: nx, y: ny }).catch(() => {});
  }, { passive: true });
}

// ===== CONNECTOR LINES =====
function noteCenter(docId) {
  const d  = notesData[docId];
  const el = noteEls[docId];
  if (!d || !el) return null;
  const w = el.offsetWidth  || NOTE_W;
  const h = el.offsetHeight || NOTE_H;
  return {
    x: d.x * scale + panX + w * scale / 2,
    y: d.y * scale + panY + h * scale / 2,
  };
}

function drawLine(docId) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.classList.add('connector');
  linesSvg.appendChild(path);
  lineEls[docId] = path;
  updateLine(docId);
}

function updateLine(docId) {
  const path = lineEls[docId];
  const data = notesData[docId];
  if (!path || !data?.replyTo) return;
  const from = noteCenter(data.replyTo);
  const to   = noteCenter(docId);
  if (!from || !to) return;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2 - 30;
  path.setAttribute('d', `M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`);
}

function updateAllLines() {
  for (const docId of Object.keys(notesData)) {
    if (notesData[docId]?.replyTo) updateLine(docId);
  }
}

// ===== FIRESTORE =====
const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
onSnapshot(q, snapshot => {
  snapshot.docChanges().forEach(change => {
    if (change.type === 'added' || change.type === 'modified') renderNote(change.doc.id, change.doc.data());
    if (change.type === 'removed') removeNote(change.doc.id);
  });
});

// ===== SEND NOTE =====
const nameInp = document.getElementById('inp-name');
const textInp = document.getElementById('inp-text');
const sendBtn = document.getElementById('inp-send');

async function sendNote() {
  const name = nameInp.value.trim() || '匿名';
  const text = textInp.value.trim();
  if (!text) { textInp.focus(); return; }
  sendBtn.disabled = true; sendBtn.textContent = '发送中...';
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const pos   = findPos();
  try {
    await addDoc(collection(db, 'messages'), {
      name, text, color, x: pos.x, y: pos.y,
      createdAt: serverTimestamp(),
    });
    nameInp.value = ''; textInp.value = '';
    // pan to new note
    panX = wrap.clientWidth  / 2 - (pos.x + NOTE_W / 2) * scale;
    panY = wrap.clientHeight / 2 - (pos.y + NOTE_H / 2) * scale;
    applyT();
  } catch(e) { alert('发送失败，请重试'); console.error(e); }
  sendBtn.disabled = false; sendBtn.textContent = '发送';
}

sendBtn.addEventListener('click', sendNote);

// ===== REPLY =====
let replyTargetId = null;

function openReply(docId, data) {
  replyTargetId = docId;
  document.getElementById('reply-preview').textContent = `"${data.text}"`;
  document.getElementById('reply-name').value = '';
  document.getElementById('reply-text').value = '';
  document.getElementById('reply-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('reply-text').focus(), 80);
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
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const pos   = posNearParent(replyTargetId);
  try {
    await addDoc(collection(db, 'messages'), {
      name, text, color, x: pos.x, y: pos.y,
      replyTo: replyTargetId,
      createdAt: serverTimestamp(),
    });
    document.getElementById('reply-modal').style.display = 'none';
    replyTargetId = null;
  } catch(e) { alert('发送失败'); console.error(e); }
  btn.disabled = false; btn.textContent = '发送';
});

// ===== ADMIN =====
document.getElementById('admin-btn').addEventListener('click', () => {
  if (isAdmin) {
    isAdmin = false;
    document.getElementById('admin-btn').textContent = '🔒';
    document.getElementById('admin-btn').classList.remove('active');
    document.body.classList.remove('admin-mode');
    return;
  }
  document.getElementById('admin-pass').value = '';
  document.getElementById('admin-error').textContent = '';
  document.getElementById('admin-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('admin-pass').focus(), 80);
});

document.getElementById('admin-cancel').addEventListener('click', () => {
  document.getElementById('admin-modal').style.display = 'none';
});

document.getElementById('admin-confirm').addEventListener('click', () => {
  const pass = document.getElementById('admin-pass').value;
  if (pass === ADMIN_PASS) {
    isAdmin = true;
    document.getElementById('admin-btn').textContent = '🔑';
    document.getElementById('admin-btn').classList.add('active');
    document.body.classList.add('admin-mode');
    document.getElementById('admin-modal').style.display = 'none';
  } else {
    document.getElementById('admin-error').textContent = '密码错误，请重试';
  }
});

document.getElementById('admin-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('admin-confirm').click();
});

// close modals tapping backdrop
document.querySelectorAll('.modal-wrap').forEach(wrap => {
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.style.display = 'none'; });
});

// ===== UTILS =====
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== INIT =====
applyT();
