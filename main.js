import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
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
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ===== STICKY COLORS =====
const COLORS = [
  '#fef08a', // yellow
  '#bbf7d0', // green
  '#bfdbfe', // blue
  '#fecaca', // red
  '#e9d5ff', // purple
  '#fed7aa', // orange
  '#fbcfe8', // pink
  '#a5f3fc', // cyan
];

// ===== APP CONFIG =====
const appConfig = {
  notebook: { title: '📌 留言板', tpl: 'tpl-notebook', w: 680, h: 460 },
  about:    { title: '👤 关于我', tpl: 'tpl-about',    w: 360, h: 420 },
  projects: { title: '💼 我的项目',tpl: 'tpl-projects', w: 440, h: 480 },
  contact:  { title: '✉️ 联系我', tpl: 'tpl-contact',  w: 360, h: 340 },
};

let zTop = 100;
const openWindows = {};

// ===== CLOCK =====
function tick() {
  const el = document.getElementById('menuClock');
  if (el) el.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
tick();
setInterval(tick, 10000);

// ===== OPEN APP =====
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
  win.style.left = Math.max(20, (dw - cfg.w) / 2 + (Math.random() - .5) * 120) + 'px';
  win.style.top  = Math.max(10, (dh - cfg.h) / 2 + (Math.random() - .5) * 80) + 'px';

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
}

function focusWin(win) { win.style.zIndex = ++zTop; }

// ===== DRAG WINDOWS =====
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

// ===== BOARD =====
let pendingDelete = null; // { docId, deleteCode }

function initBoard(win) {
  const boardArea = win.querySelector('#board-area');
  const boardEmpty = win.querySelector('#board-empty');
  const nameInput  = win.querySelector('#form-name');
  const textInput  = win.querySelector('#form-text');
  const sendBtn    = win.querySelector('#form-send');

  // random bg color for the form sticky
  const formSticky = win.querySelector('.form-sticky');
  formSticky.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];

  // listen Firestore
  const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
  const unsub = onSnapshot(q, snapshot => {
    // clear existing stickies
    boardArea.querySelectorAll('.sticky').forEach(s => s.remove());
    if (snapshot.empty) {
      if (boardEmpty) boardEmpty.style.display = 'block';
      return;
    }
    if (boardEmpty) boardEmpty.style.display = 'none';

    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      addStickyToBoard(boardArea, docSnap.id, d);
    });
  });

  // send
  sendBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim() || '匿名';
    const text = textInput.value.trim();
    if (!text) { textInput.focus(); return; }

    sendBtn.disabled = true;
    sendBtn.textContent = '贴中...';

    // generate 6-digit delete code
    const deleteCode = String(Math.floor(100000 + Math.random() * 900000));
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    // random position in board area
    const bw = boardArea.offsetWidth  || 460;
    const bh = boardArea.offsetHeight || 400;
    const px = Math.random() * (bw - 170) + 10;
    const py = Math.random() * (bh - 160) + 10;
    const rot = (Math.random() - 0.5) * 10;

    try {
      await addDoc(collection(db, 'messages'), {
        name, text, color, deleteCode,
        x: px, y: py, rot,
        createdAt: serverTimestamp(),
        expiresAt: Date.now() + 3600000
      });
      nameInput.value = '';
      textInput.value = '';
      showCodeToast(deleteCode);
    } catch (err) {
      alert('发送失败，请重试');
      console.error(err);
    }

    sendBtn.disabled = false;
    sendBtn.textContent = '📌 贴上去！';
  });
}

function addStickyToBoard(boardArea, docId, data) {
  const sticky = document.createElement('div');
  sticky.className = 'sticky';
  sticky.dataset.id = docId;
  sticky.style.background = data.color || COLORS[0];
  sticky.style.left = (data.x || 20) + 'px';
  sticky.style.top  = (data.y || 20) + 'px';
  sticky.style.zIndex = 10;
  sticky.style.setProperty('--r', (data.rot || 0) + 'deg');
  sticky.style.transform = `rotate(${data.rot || 0}deg)`;

  const time = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '刚刚';

  // check if within 1hr
  const canDelete = !data.expiresAt || Date.now() < data.expiresAt;

  sticky.innerHTML = `
    <div class="sticky-pin">📌</div>
    <div class="sticky-name">${escHtml(data.name || '匿名')}</div>
    <div class="sticky-text">${escHtml(data.text)}</div>
    <div class="sticky-time">${time}</div>
    ${canDelete ? `<button class="sticky-del" title="删除">🗑</button>` : ''}
  `;

  // drag sticky within board
  makeStickyDraggable(sticky, boardArea, docId);

  if (canDelete) {
    sticky.querySelector('.sticky-del').addEventListener('click', e => {
      e.stopPropagation();
      openDeleteModal(docId);
    });
  }

  boardArea.appendChild(sticky);
}

// drag stickies
function makeStickyDraggable(sticky, container, docId) {
  let dragging = false, ox = 0, oy = 0;
  sticky.addEventListener('mousedown', e => {
    if (e.target.classList.contains('sticky-del')) return;
    dragging = true;
    ox = e.clientX - sticky.offsetLeft;
    oy = e.clientY - sticky.offsetTop;
    sticky.style.zIndex = ++zTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const cw = container.offsetWidth  - sticky.offsetWidth;
    const ch = container.offsetHeight - sticky.offsetHeight;
    sticky.style.left = Math.max(0, Math.min(cw, e.clientX - ox)) + 'px';
    sticky.style.top  = Math.max(0, Math.min(ch, e.clientY - oy)) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}

// ===== DELETE MODAL =====
function openDeleteModal(docId) {
  pendingDelete = docId;
  const modal = document.getElementById('delete-modal');
  const codeInput = document.getElementById('modal-code');
  const errEl = document.getElementById('modal-error');
  codeInput.value = '';
  errEl.textContent = '';
  modal.style.display = 'flex';
  codeInput.focus();
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('delete-modal').style.display = 'none';
  pendingDelete = null;
});

document.getElementById('modal-confirm').addEventListener('click', async () => {
  const code = document.getElementById('modal-code').value.trim();
  const errEl = document.getElementById('modal-error');
  if (!code || code.length !== 6) {
    errEl.textContent = '请输入 6 位删除码';
    return;
  }

  // find the sticky with matching docId and check code via Firestore
  // We'll try to delete and let security rules handle it, but since we're in test mode
  // we fetch the doc first to verify code client-side
  try {
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const docRef = doc(db, 'messages', pendingDelete);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      errEl.textContent = '留言不存在';
      return;
    }

    const data = snap.data();

    if (data.deleteCode !== code) {
      errEl.textContent = '删除码错误，请重试';
      return;
    }

    if (data.expiresAt && Date.now() > data.expiresAt) {
      errEl.textContent = '删除码已过期（超过 1 小时）';
      return;
    }

    await deleteDoc(docRef);
    document.getElementById('delete-modal').style.display = 'none';
    pendingDelete = null;

  } catch (err) {
    errEl.textContent = '删除失败，请重试';
    console.error(err);
  }
});

// ===== CODE TOAST =====
function showCodeToast(code) {
  const toast = document.getElementById('code-toast');
  document.getElementById('toast-code-val').textContent = code;
  toast.style.display = 'flex';
}

document.getElementById('toast-close').addEventListener('click', () => {
  document.getElementById('code-toast').style.display = 'none';
});

// ===== UTILS =====
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== EVENTS =====
// Desktop icons: double click
document.querySelectorAll('.icon').forEach(icon => {
  let clicks = 0;
  icon.addEventListener('click', () => {
    clicks++;
    if (clicks === 1) setTimeout(() => { clicks = 0; }, 300);
    if (clicks >= 2) { openApp(icon.dataset.app); clicks = 0; }
  });
});

// Dock: single click
document.querySelectorAll('.dock-item').forEach(item => {
  item.addEventListener('click', () => openApp(item.dataset.app));
});
