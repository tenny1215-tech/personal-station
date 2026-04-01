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
const RANDOM_NAMES   = ['可爱的猫咪','神秘访客','快乐小鸟','热情的人','路过的风','安静的树','开心果','微笑的云','好奇的鱼','温柔的光'];
const STICKY_COLORS  = ['#fef08a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa','#fbcfe8','#a5f3fc'];
const NOTE_W = 180, NOTE_H = 120, PAD = 32;

// ===== MY IDENTITY =====
const myId    = Math.random().toString(36).slice(2, 10);
const myColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
const myName  = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];

// ===== ADMIN STATE =====
let isAdmin = false;

// ===== CANVAS STATE =====
const canvasEl  = document.getElementById('canvas');
const wrap      = document.getElementById('canvas-wrap');
const linesSvg  = document.getElementById('lines-svg');
let scale = 1, panX = 0, panY = 0;
let isPanning = false, panStartX = 0, panStartY = 0;

// ===== TRANSFORM =====
function applyTransform() {
  canvasEl.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  document.getElementById('zoom-label').textContent = Math.round(scale * 100) + '%';
  updateAllLines();
}

// zoom
function zoomTo(s, cx, cy) {
  const ns = Math.min(2.5, Math.max(0.1, s));
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

// pan canvas
wrap.addEventListener('mousedown', e => {
  if (e.target.closest('.sticky') || e.target.closest('.cursor-wrap')) return;
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

// ===== NOTE LAYOUT =====
const placedRects = [];

function findPosition(isReply = false) {
  const vw = wrap.clientWidth, vh = wrap.clientHeight;
  const nw = isReply ? 150 : NOTE_W;
  const nh = isReply ? 100 : NOTE_H;
  const cx = (vw / 2 - panX) / scale;
  const cy = (vh / 2 - panY) / scale;
  const step = nw + PAD;

  for (let ring = 0; ring < 50; ring++) {
    const positions = ring === 0
      ? [{ x: cx - nw/2, y: cy - nh/2 }]
      : [];
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
      if (!overlaps(p.x, p.y, nw, nh)) {
        placedRects.push({ x: p.x, y: p.y, w: nw, h: nh });
        return p;
      }
    }
  }
  const fb = { x: cx + Math.random()*400-200, y: cy + Math.random()*400-200 };
  placedRects.push({ x: fb.x, y: fb.y, w: nw, h: nh });
  return fb;
}

function overlaps(x, y, nw, nh) {
  for (const r of placedRects) {
    if (x < r.x+r.w+PAD && x+nw+PAD > r.x && y < r.y+r.h+PAD && y+nh+PAD > r.y) return true;
  }
  return false;
}

// ===== NOTES STATE =====
const notesData = {}; // docId -> data
const noteEls   = {}; // docId -> DOM el
const lineEls   = {}; // docId -> SVG line (for replies)
let noteCount   = 0;

// ===== RENDER NOTE =====
function renderNote(docId, data) {
  if (noteEls[docId]) {
    // update position if changed
    const el = noteEls[docId];
    el.style.left = data.x + 'px';
    el.style.top  = data.y + 'px';
    notesData[docId] = data;
    updateLine(docId, data);
    return;
  }

  notesData[docId] = data;
  const isReply = !!data.replyTo;
  const el = document.createElement('div');
  el.className = 'sticky' + (isReply ? ' is-reply' : '');
  el.dataset.id = docId;
  el.style.cssText = `background:${data.color||STICKY_COLORS[0]};left:${data.x||0}px;top:${data.y||0}px;z-index:${data.z||1}`;

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
    </div>
  `;

  // drag sticky
  makeStickyDraggable(el, docId);

  // reply button
  el.querySelector('.sticky-reply-btn').addEventListener('click', e => {
    e.stopPropagation();
    openReplyModal(docId, data);
  });

  // delete button (admin only, shown via CSS)
  el.querySelector('.sticky-del-btn').addEventListener('click', async e => {
    e.stopPropagation();
    if (!isAdmin) return;
    if (!confirm('确认删除这条留言？')) return;
    try {
      await deleteDoc(doc(db, 'messages', docId));
    } catch (err) { console.error(err); }
  });

  canvasEl.appendChild(el);
  noteEls[docId] = el;
  noteCount++;
  document.getElementById('note-count').textContent = noteCount + ' 条留言';

  // draw connector line for replies
  if (isReply && data.replyTo) drawLine(docId, data);
}

function removeNote(docId) {
  const el = noteEls[docId];
  if (el) {
    el.style.transition = 'transform .2s, opacity .2s';
    el.style.transform  = 'scale(0.6)';
    el.style.opacity    = '0';
    setTimeout(() => el.remove(), 220);
    delete noteEls[docId];
    delete notesData[docId];
  }
  // remove line
  if (lineEls[docId]) { lineEls[docId].remove(); delete lineEls[docId]; }
  noteCount = Math.max(0, noteCount - 1);
  document.getElementById('note-count').textContent = noteCount + ' 条留言';
}

// ===== DRAG STICKIES =====
let dragThrottle = 0;

function makeStickyDraggable(el, docId) {
  let dragging = false, ox = 0, oy = 0;

  el.addEventListener('mousedown', e => {
    if (e.target.classList.contains('sticky-reply-btn') ||
        e.target.classList.contains('sticky-del-btn')) return;
    dragging = true;
    el.style.zIndex = 999;
    ox = e.clientX - el.offsetLeft * scale - panX;
    oy = e.clientY - el.offsetTop  * scale - panY;
    e.stopPropagation();
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const nx = (e.clientX - panX - ox) / scale;
    const ny = (e.clientY - panY - oy) / scale;
    el.style.left = nx + 'px';
    el.style.top  = ny + 'px';
    // update lines in realtime
    updateAllLines();
    // throttle firestore write
    const now = Date.now();
    if (now - dragThrottle > 120) {
      dragThrottle = now;
      updateDoc(doc(db, 'messages', docId), { x: nx, y: ny }).catch(() => {});
    }
  });

  document.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging = false;
    const nx = parseFloat(el.style.left);
    const ny = parseFloat(el.style.top);
    updateDoc(doc(db, 'messages', docId), { x: nx, y: ny }).catch(() => {});
  });
}

// ===== CONNECTOR LINES =====
function noteCenter(docId) {
  const d = notesData[docId];
  if (!d) return null;
  const el = noteEls[docId];
  const w = el ? el.offsetWidth  : (d.replyTo ? 150 : NOTE_W);
  const h = el ? el.offsetHeight : (d.replyTo ? 100 : NOTE_H);
  // convert canvas coords to screen coords
  const sx = d.x * scale + panX + w * scale / 2;
  const sy = d.y * scale + panY + h * scale / 2;
  return { x: sx, y: sy };
}

function drawLine(docId, data) {
  if (!data.replyTo) return;
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.classList.add('connector-line');
  linesSvg.appendChild(line);
  lineEls[docId] = line;
  updateLine(docId, data);
}

function updateLine(docId, data) {
  const line = lineEls[docId];
  if (!line || !data.replyTo) return;
  const from = noteCenter(data.replyTo);
  const to   = noteCenter(docId);
  if (!from || !to) return;
  // curved bezier
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2 - 40;
  line.setAttribute('d', `M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`);
}

function updateAllLines() {
  for (const [docId, data] of Object.entries(notesData)) {
    if (data.replyTo) updateLine(docId, data);
  }
}

// ===== FIRESTORE =====
const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
onSnapshot(q, snapshot => {
  snapshot.docChanges().forEach(change => {
    if (change.type === 'added' || change.type === 'modified') {
      renderNote(change.doc.id, change.doc.data());
    }
    if (change.type === 'removed') {
      removeNote(change.doc.id);
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
  const pos   = findPosition(false);
  try {
    await addDoc(collection(db, 'messages'), {
      name, text, color,
      x: pos.x, y: pos.y, z: 1,
      createdAt: serverTimestamp(),
    });
    nameInp.value = '';
    textInp.value = '';
    panX = wrap.clientWidth/2  - (pos.x + NOTE_W/2) * scale;
    panY = wrap.clientHeight/2 - (pos.y + NOTE_H/2) * scale;
    applyTransform();
  } catch(err) { alert('发送失败，请重试'); console.error(err); }
  sendBtn.disabled = false;
  sendBtn.textContent = '发送';
}

sendBtn.addEventListener('click', sendNote);
textInp.addEventListener('keydown', e => { if (e.key === 'Enter') sendNote(); });

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
  const name = document.getElementById('reply-name').value.trim() || myName;
  const text = document.getElementById('reply-text').value.trim();
  if (!text) { document.getElementById('reply-text').focus(); return; }

  const btn = document.getElementById('reply-confirm');
  btn.disabled = true; btn.textContent = '发送中...';

  const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
  const pos   = findPosition(true);

  try {
    await addDoc(collection(db, 'messages'), {
      name, text, color,
      x: pos.x, y: pos.y, z: 1,
      replyTo: replyTargetId,
      createdAt: serverTimestamp(),
    });
    document.getElementById('reply-modal').style.display = 'none';
    replyTargetId = null;
  } catch(err) { alert('发送失败'); console.error(err); }

  btn.disabled = false; btn.textContent = '发送回复';
});

// ===== ADMIN =====
const adminBtn = document.getElementById('admin-btn');

adminBtn.addEventListener('click', () => {
  if (isAdmin) {
    // logout
    isAdmin = false;
    adminBtn.textContent = '🔒';
    adminBtn.classList.remove('active');
    document.body.classList.remove('admin-mode');
    return;
  }
  document.getElementById('admin-pass').value = '';
  document.getElementById('admin-error').textContent = '';
  document.getElementById('admin-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('admin-pass').focus(), 50);
});

document.getElementById('admin-cancel').addEventListener('click', () => {
  document.getElementById('admin-modal').style.display = 'none';
});

document.getElementById('admin-confirm').addEventListener('click', () => {
  const pass = document.getElementById('admin-pass').value;
  if (pass === ADMIN_PASSWORD) {
    isAdmin = true;
    adminBtn.textContent = '🔑';
    adminBtn.classList.add('active');
    document.body.classList.add('admin-mode');
    document.getElementById('admin-modal').style.display = 'none';
  } else {
    document.getElementById('admin-error').textContent = '密码错误，请重试';
  }
});

document.getElementById('admin-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('admin-confirm').click();
});

// ===== CURSOR PRESENCE =====
const cursorsEl = document.getElementById('cursors');
const cursorEls = {};
const myRef     = ref(rtdb, `cursors/${myId}`);
set(myRef, { name: myName, color: myColor, x: 0.5, y: 0.5, active: true });
onDisconnect(myRef).remove();

let lastSend = 0;
wrap.addEventListener('mousemove', e => {
  const now = Date.now();
  if (now - lastSend < 50) return;
  lastSend = now;
  const rc = wrap.getBoundingClientRect();
  set(myRef, {
    name: myName, color: myColor,
    x: (e.clientX - rc.left) / rc.width,
    y: (e.clientY - rc.top)  / rc.height,
    active: true
  });
});
wrap.addEventListener('mouseleave', () => {
  set(myRef, { name: myName, color: myColor, x: -1, y: -1, active: false });
});

const cursorsRef = ref(rtdb, 'cursors');
onChildAdded(cursorsRef,   snap => { if (snap.key !== myId) upsertCursor(snap.key, snap.val()); });
onChildChanged(cursorsRef, snap => { if (snap.key !== myId) upsertCursor(snap.key, snap.val()); });
onChildRemoved(cursorsRef, snap => {
  const el = cursorEls[snap.key];
  if (el) { el.remove(); delete cursorEls[snap.key]; }
});

function upsertCursor(uid, data) {
  let el = cursorEls[uid];
  if (!el) {
    el = document.createElement('div');
    el.className = 'cursor-wrap';
    el.innerHTML = `
      <svg class="cursor-svg" width="20" height="24" viewBox="0 0 20 24" fill="none">
        <path d="M0 0L0 20L5.5 14.5L9 22L11.5 21L8 13.5L15 13.5L0 0Z" fill="${data.color}" stroke="white" stroke-width="1.5"/>
      </svg>
      <div class="cursor-name" style="background:${data.color}">${escHtml(data.name)}</div>`;
    cursorsEl.appendChild(el);
    cursorEls[uid] = el;
  }
  if (!data.active || data.x < 0) { el.style.opacity = '0'; return; }
  const rc = wrap.getBoundingClientRect();
  el.style.opacity = '1';
  el.style.left = (data.x * rc.width)  + 'px';
  el.style.top  = (data.y * rc.height) + 'px';
}

// online count
onValue(ref(rtdb, 'cursors'), snap => {
  const n = snap.exists() ? Object.keys(snap.val()).length : 0;
  document.getElementById('online-count').textContent = n + ' 人在线';
});

// ===== UTILS =====
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== INIT =====
applyTransform();
