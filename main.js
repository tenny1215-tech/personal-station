import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDatabase, ref, set, onValue, onDisconnect, remove, onChildAdded, onChildChanged, onChildRemoved
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
const db  = getFirestore(firebaseApp);
const rtdb = getDatabase(firebaseApp);

// ===== COLORS & NAMES =====
const CURSOR_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#06b6d4','#6366f1','#a855f7','#ec4899',
];
const RANDOM_NAMES = [
  '可爱的猫咪','神秘访客','快乐小鸟','热情的人',
  '路过的风','安静的树','开心果','微笑的云',
  '好奇的鱼','温柔的光','自由的风','小小星星',
];
const STICKY_COLORS = [
  '#fef08a','#bbf7d0','#bfdbfe','#fecaca',
  '#e9d5ff','#fed7aa','#fbcfe8','#a5f3fc',
];

// ===== MY IDENTITY =====
const myId    = Math.random().toString(36).slice(2, 10);
const myColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
const myName  = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];

// ===== CANVAS STATE =====
const canvasEl = document.getElementById('canvas');
const wrap     = document.getElementById('canvas-wrap');
let scale = 1, panX = 0, panY = 0;
let isPanning = false, panStartX = 0, panStartY = 0;

const NOTE_W  = 180;
const NOTE_H  = 110;
const PADDING = 28;
const placedRects = [];

function applyTransform() {
  canvasEl.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  document.getElementById('zoom-label').textContent = Math.round(scale * 100) + '%';
}

// zoom
function zoomTo(s, cx, cy) {
  const ns = Math.min(2, Math.max(0.15, s));
  const r  = ns / scale;
  panX = cx - r * (cx - panX);
  panY = cy - r * (cy - panY);
  scale = ns;
  applyTransform();
}
wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const rc = wrap.getBoundingClientRect();
  zoomTo(scale * (e.deltaY > 0 ? 0.9 : 1.1), e.clientX - rc.left, e.clientY - rc.top);
}, { passive: false });
document.getElementById('zoom-in').addEventListener('click',    () => zoomTo(scale * 1.2, wrap.clientWidth/2, wrap.clientHeight/2));
document.getElementById('zoom-out').addEventListener('click',   () => zoomTo(scale * 0.8, wrap.clientWidth/2, wrap.clientHeight/2));
document.getElementById('zoom-reset').addEventListener('click', () => { scale=1; panX=0; panY=0; applyTransform(); });

// pan
wrap.addEventListener('mousedown', e => {
  const t = e.target;
  if (t.closest('.sticky') || t.closest('.cursor-label')) return;
  isPanning = true;
  panStartX = e.clientX - panX;
  panStartY = e.clientY - panY;
  wrap.classList.add('grabbing');
});
document.addEventListener('mousemove', e => {
  if (!isPanning) return;
  panX = e.clientX - panStartX;
  panY = e.clientY - panStartY;
  applyTransform();
});
document.addEventListener('mouseup', () => { isPanning = false; wrap.classList.remove('grabbing'); });

// ===== CURSOR PRESENCE =====
const cursorsEl  = document.getElementById('cursors');
const cursorEls  = {}; // uid -> {el, label}
const myRef      = ref(rtdb, `cursors/${myId}`);

// set initial presence
set(myRef, { name: myName, color: myColor, x: 0.5, y: 0.5, active: true });

// remove on disconnect
onDisconnect(myRef).remove();

// broadcast my cursor (throttled)
let lastSend = 0;
wrap.addEventListener('mousemove', e => {
  const now = Date.now();
  if (now - lastSend < 50) return; // 20fps max
  lastSend = now;
  const rc = wrap.getBoundingClientRect();
  // store as fraction of wrap size so it works on different screen sizes
  const fx = (e.clientX - rc.left) / rc.width;
  const fy = (e.clientY - rc.top)  / rc.height;
  set(myRef, { name: myName, color: myColor, x: fx, y: fy, active: true });
});

wrap.addEventListener('mouseleave', () => {
  set(myRef, { name: myName, color: myColor, x: -1, y: -1, active: false });
});

// listen to all cursors
const cursorsRef = ref(rtdb, 'cursors');

onChildAdded(cursorsRef, snap => {
  if (snap.key === myId) return;
  createCursorEl(snap.key, snap.val());
});
onChildChanged(cursorsRef, snap => {
  if (snap.key === myId) return;
  updateCursorEl(snap.key, snap.val());
});
onChildRemoved(cursorsRef, snap => {
  removeCursorEl(snap.key);
});

function createCursorEl(uid, data) {
  if (cursorEls[uid]) return;
  const el = document.createElement('div');
  el.className = 'cursor-wrap';
  el.innerHTML = `
    <svg class="cursor-svg" width="20" height="24" viewBox="0 0 20 24" fill="none">
      <path d="M0 0L0 20L5.5 14.5L9 22L11.5 21L8 13.5L15 13.5L0 0Z" fill="${data.color}" stroke="white" stroke-width="1.5"/>
    </svg>
    <div class="cursor-name" style="background:${data.color}">${escHtml(data.name)}</div>
  `;
  cursorsEl.appendChild(el);
  cursorEls[uid] = el;
  updateCursorEl(uid, data);
}

function updateCursorEl(uid, data) {
  const el = cursorEls[uid];
  if (!el) { createCursorEl(uid, data); return; }
  if (!data.active || data.x < 0) {
    el.style.opacity = '0';
    return;
  }
  const rc = wrap.getBoundingClientRect();
  el.style.opacity  = '1';
  el.style.left = (data.x * rc.width)  + 'px';
  el.style.top  = (data.y * rc.height) + 'px';
}

function removeCursorEl(uid) {
  const el = cursorEls[uid];
  if (el) { el.remove(); delete cursorEls[uid]; }
}

// ===== NOTE LAYOUT =====
function findPosition() {
  const vw = wrap.clientWidth, vh = wrap.clientHeight;
  const cx = (vw / 2 - panX) / scale;
  const cy = (vh / 2 - panY) / scale;
  const step = NOTE_W + PADDING;

  for (let ring = 0; ring < 40; ring++) {
    const positions = [];
    if (ring === 0) {
      positions.push({ x: cx - NOTE_W/2, y: cy - NOTE_H/2 });
    } else {
      for (let c = -ring; c <= ring; c++) {
        positions.push({ x: cx + c*step - NOTE_W/2, y: cy - ring*(NOTE_H+PADDING) - NOTE_H/2 });
        positions.push({ x: cx + c*step - NOTE_W/2, y: cy + ring*(NOTE_H+PADDING) - NOTE_H/2 });
      }
      for (let r = -ring+1; r <= ring-1; r++) {
        positions.push({ x: cx - ring*step - NOTE_W/2, y: cy + r*(NOTE_H+PADDING) - NOTE_H/2 });
        positions.push({ x: cx + ring*step - NOTE_W/2, y: cy + r*(NOTE_H+PADDING) - NOTE_H/2 });
      }
    }
    for (const p of positions) {
      if (!overlaps(p.x, p.y)) {
        placedRects.push({ x: p.x, y: p.y, w: NOTE_W, h: NOTE_H });
        return p;
      }
    }
  }
  const fb = { x: cx + Math.random()*300-150, y: cy + Math.random()*300-150 };
  placedRects.push({ x: fb.x, y: fb.y, w: NOTE_W, h: NOTE_H });
  return fb;
}

function overlaps(x, y) {
  for (const r of placedRects) {
    if (x < r.x+r.w+PADDING && x+NOTE_W+PADDING > r.x &&
        y < r.y+r.h+PADDING && y+NOTE_H+PADDING > r.y) return true;
  }
  return false;
}

// ===== RENDER NOTES =====
const noteEls = {};
let noteCount = 0;

function renderNote(docId, data) {
  if (noteEls[docId]) return;
  const el = document.createElement('div');
  el.className = 'sticky';
  el.style.cssText = `
    background:${data.color || STICKY_COLORS[0]};
    left:${data.x||0}px; top:${data.y||0}px;
  `;
  const time = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
    : '刚刚';
  el.innerHTML = `
    <div class="sticky-name">${escHtml(data.name||'匿名')}</div>
    <div class="sticky-text">${escHtml(data.text)}</div>
    <div class="sticky-time">${time}</div>
  `;
  canvasEl.appendChild(el);
  noteEls[docId] = el;
  noteCount++;
  document.getElementById('note-count').textContent = noteCount + ' 条留言';
}

// firestore listener
const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
onSnapshot(q, snapshot => {
  snapshot.docChanges().forEach(change => {
    if (change.type === 'added') renderNote(change.doc.id, change.doc.data());
    if (change.type === 'removed') {
      const el = noteEls[change.doc.id];
      if (el) { el.remove(); delete noteEls[change.doc.id]; noteCount = Math.max(0, noteCount-1); }
      document.getElementById('note-count').textContent = noteCount + ' 条留言';
    }
  });
});

// ===== SEND NOTE =====
const sendBtn = document.getElementById('inp-send');
const nameInp = document.getElementById('inp-name');
const textInp = document.getElementById('inp-text');

async function sendNote() {
  const name = nameInp.value.trim() || myName;
  const text = textInp.value.trim();
  if (!text) { textInp.focus(); return; }
  sendBtn.disabled = true;
  sendBtn.textContent = '发送中...';
  const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
  const pos   = findPosition();
  try {
    await addDoc(collection(db, 'messages'), {
      name, text, color,
      x: pos.x, y: pos.y,
      createdAt: serverTimestamp(),
    });
    nameInp.value = '';
    textInp.value = '';
    // pan to new note
    panX = wrap.clientWidth/2  - (pos.x + NOTE_W/2) * scale;
    panY = wrap.clientHeight/2 - (pos.y + NOTE_H/2) * scale;
    applyTransform();
  } catch (err) {
    alert('发送失败，请重试');
    console.error(err);
  }
  sendBtn.disabled = false;
  sendBtn.textContent = '发送';
}

sendBtn.addEventListener('click', sendNote);
textInp.addEventListener('keydown', e => { if (e.key === 'Enter') sendNote(); });

// ===== ONLINE COUNT =====
onValue(ref(rtdb, 'cursors'), snap => {
  const count = snap.exists() ? Object.keys(snap.val()).length : 0;
  document.getElementById('online-count').textContent = count + ' 人在线';
});

// ===== UTILS =====
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== INIT =====
applyTransform();
