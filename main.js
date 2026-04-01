import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, getDoc,
  onSnapshot, orderBy, query, serverTimestamp
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

// ===== COLORS =====
const COLORS = [
  '#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca',
  '#e9d5ff', '#fed7aa', '#fbcfe8', '#a5f3fc',
  '#d9f99d', '#fde68a',
];

// ===== CANVAS STATE =====
const canvas    = document.getElementById('canvas');
const wrap      = document.getElementById('canvas-wrap');
let scale       = 1;
let panX        = 0;
let panY        = 0;
let isPanning   = false;
let panStartX   = 0;
let panStartY   = 0;
const NOTE_W    = 180;
const NOTE_H    = 100; // approx
const PADDING   = 24;

// ===== GRID LAYOUT ENGINE =====
// Keeps track of placed note positions to avoid overlap
const placedRects = [];

function findPosition() {
  // canvas visible center
  const vw = wrap.clientWidth;
  const vh = wrap.clientHeight;

  // spiral outward from center until we find a free spot
  const cx = (vw / 2 - panX) / scale;
  const cy = (vh / 2 - panY) / scale;

  const step = NOTE_W + PADDING;
  for (let ring = 0; ring < 30; ring++) {
    const positions = [];
    if (ring === 0) {
      positions.push({ x: cx - NOTE_W / 2, y: cy - NOTE_H / 2 });
    } else {
      for (let col = -ring; col <= ring; col++) {
        positions.push({ x: cx + col * step - NOTE_W / 2, y: cy - ring * (NOTE_H + PADDING) - NOTE_H / 2 });
        positions.push({ x: cx + col * step - NOTE_W / 2, y: cy + ring * (NOTE_H + PADDING) - NOTE_H / 2 });
      }
      for (let row = -ring + 1; row <= ring - 1; row++) {
        positions.push({ x: cx - ring * step - NOTE_W / 2, y: cy + row * (NOTE_H + PADDING) - NOTE_H / 2 });
        positions.push({ x: cx + ring * step - NOTE_W / 2, y: cy + row * (NOTE_H + PADDING) - NOTE_H / 2 });
      }
    }
    for (const pos of positions) {
      if (!overlaps(pos.x, pos.y)) {
        placedRects.push({ x: pos.x, y: pos.y, w: NOTE_W, h: NOTE_H + PADDING });
        return pos;
      }
    }
  }
  // fallback
  const fb = { x: cx + Math.random() * 200 - 100, y: cy + Math.random() * 200 - 100 };
  placedRects.push({ x: fb.x, y: fb.y, w: NOTE_W, h: NOTE_H + PADDING });
  return fb;
}

function overlaps(x, y) {
  for (const r of placedRects) {
    if (
      x < r.x + r.w + PADDING &&
      x + NOTE_W + PADDING > r.x &&
      y < r.y + r.h + PADDING &&
      y + NOTE_H + PADDING > r.y
    ) return true;
  }
  return false;
}

// ===== APPLY TRANSFORM =====
function applyTransform() {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  document.getElementById('zoom-label').textContent = Math.round(scale * 100) + '%';
}

// ===== ZOOM =====
function zoomTo(newScale, cx, cy) {
  const clampedScale = Math.min(2, Math.max(0.2, newScale));
  const ratio = clampedScale / scale;
  panX = cx - ratio * (cx - panX);
  panY = cy - ratio * (cy - panY);
  scale = clampedScale;
  applyTransform();
}

wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = wrap.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  zoomTo(scale * delta, cx, cy);
}, { passive: false });

document.getElementById('zoom-in').addEventListener('click',  () => zoomTo(scale * 1.2, wrap.clientWidth/2, wrap.clientHeight/2));
document.getElementById('zoom-out').addEventListener('click', () => zoomTo(scale * 0.8, wrap.clientWidth/2, wrap.clientHeight/2));
document.getElementById('zoom-reset').addEventListener('click', () => {
  scale = 1; panX = 0; panY = 0; applyTransform();
});

// ===== PAN =====
wrap.addEventListener('mousedown', e => {
  if (e.target !== wrap && e.target !== canvas && !e.target.matches('svg, rect')) return;
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

document.addEventListener('mouseup', () => {
  isPanning = false;
  wrap.classList.remove('grabbing');
});

// ===== RENDER NOTES =====
const noteEls = {}; // docId -> element

function renderNote(docId, data, isNew = false) {
  if (noteEls[docId]) return; // already rendered

  const el = document.createElement('div');
  el.className = 'sticky';
  el.dataset.id = docId;

  const color = data.color || COLORS[0];
  el.style.background = color;
  el.style.left = (data.x || 0) + 'px';
  el.style.top  = (data.y || 0) + 'px';
  el.style.zIndex = data.z || 1;

  const time = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleString('zh-CN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : '刚刚';

  const canDelete = !data.expiresAt || Date.now() < data.expiresAt;

  el.innerHTML = `
    <div class="sticky-name">${escHtml(data.name || '匿名')}</div>
    <div class="sticky-text">${escHtml(data.text)}</div>
    <div class="sticky-footer">
      <span class="sticky-time">${time}</span>
      ${canDelete ? `<button class="sticky-del" title="删除">🗑</button>` : ''}
    </div>
  `;

  if (isNew) el.style.animation = 'stickyIn .3s cubic-bezier(.34,1.56,.64,1)';

  if (canDelete) {
    el.querySelector('.sticky-del').addEventListener('click', e => {
      e.stopPropagation();
      openDeleteModal(docId);
    });
  }

  canvas.appendChild(el);
  noteEls[docId] = el;
}

// ===== FIRESTORE LISTENER =====
let totalNotes = 0;
const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));

onSnapshot(q, snapshot => {
  // add new notes
  snapshot.docChanges().forEach(change => {
    if (change.type === 'added') {
      renderNote(change.doc.id, change.doc.data(), true);
    }
    if (change.type === 'removed') {
      const el = noteEls[change.doc.id];
      if (el) {
        el.style.transition = 'transform .2s, opacity .2s';
        el.style.transform = 'scale(0.7)';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 220);
        delete noteEls[change.doc.id];
        // remove from placedRects
        const d = change.doc.data();
        const idx = placedRects.findIndex(r => Math.abs(r.x - d.x) < 2 && Math.abs(r.y - d.y) < 2);
        if (idx !== -1) placedRects.splice(idx, 1);
      }
    }
  });

  totalNotes = Object.keys(noteEls).length;
  document.getElementById('note-count').textContent = totalNotes + ' 条留言';
});

// ===== SEND NOTE =====
const sendBtn  = document.getElementById('inp-send');
const nameInp  = document.getElementById('inp-name');
const textInp  = document.getElementById('inp-text');

async function sendNote() {
  const name = nameInp.value.trim() || '匿名';
  const text = textInp.value.trim();
  if (!text) { textInp.focus(); return; }

  sendBtn.disabled = true;
  sendBtn.textContent = '发送中...';

  const deleteCode = String(Math.floor(100000 + Math.random() * 900000));
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const pos = findPosition();
  const zVal = Date.now() % 100;

  try {
    await addDoc(collection(db, 'messages'), {
      name, text, color,
      x: pos.x, y: pos.y, z: zVal,
      deleteCode,
      createdAt: serverTimestamp(),
      expiresAt: Date.now() + 3600000,
    });
    nameInp.value = '';
    textInp.value = '';
    showCodeToast(deleteCode);

    // pan to new note
    const vw = wrap.clientWidth, vh = wrap.clientHeight;
    panX = vw / 2 - (pos.x + NOTE_W / 2) * scale;
    panY = vh / 2 - (pos.y + NOTE_H / 2) * scale;
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

// ===== DELETE MODAL =====
let pendingDeleteId = null;

function openDeleteModal(docId) {
  pendingDeleteId = docId;
  document.getElementById('modal-code').value = '';
  document.getElementById('modal-error').textContent = '';
  document.getElementById('delete-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('modal-code').focus(), 50);
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('delete-modal').style.display = 'none';
  pendingDeleteId = null;
});

document.getElementById('modal-confirm').addEventListener('click', async () => {
  const code  = document.getElementById('modal-code').value.trim();
  const errEl = document.getElementById('modal-error');
  if (code.length !== 6) { errEl.textContent = '请输入 6 位删除码'; return; }

  try {
    const ref  = doc(db, 'messages', pendingDeleteId);
    const snap = await getDoc(ref);
    if (!snap.exists()) { errEl.textContent = '留言不存在'; return; }
    const data = snap.data();
    if (data.deleteCode !== code) { errEl.textContent = '删除码错误，请重试'; return; }
    if (data.expiresAt && Date.now() > data.expiresAt) { errEl.textContent = '删除码已过期（超过 1 小时）'; return; }
    await deleteDoc(ref);
    document.getElementById('delete-modal').style.display = 'none';
    pendingDeleteId = null;
  } catch (err) {
    errEl.textContent = '删除失败，请重试';
    console.error(err);
  }
});

// ===== CODE TOAST =====
function showCodeToast(code) {
  document.getElementById('toast-code-val').textContent = code;
  document.getElementById('code-toast').style.display = 'flex';
}

document.getElementById('toast-close').addEventListener('click', () => {
  document.getElementById('code-toast').style.display = 'none';
});

// ===== ADD ANIMATION KEYFRAME =====
const s = document.createElement('style');
s.textContent = `@keyframes stickyIn { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }`;
document.head.appendChild(s);

// ===== INIT =====
applyTransform();
