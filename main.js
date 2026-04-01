// ===== FIREBASE CONFIG =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// ===== APP CONFIG =====
const appConfig = {
  notebook:  { title: '📓 留言板',  tpl: 'tpl-notebook',  w: 400, h: 460 },
  about:     { title: '👤 关于我',  tpl: 'tpl-about',     w: 360, h: 420 },
  projects:  { title: '💼 我的项目', tpl: 'tpl-projects',  w: 440, h: 480 },
  contact:   { title: '✉️ 联系我',  tpl: 'tpl-contact',   w: 360, h: 380 },
};

// ===== STATE =====
let zTop = 100;
const openWindows = {};

// ===== CLOCK =====
function updateClock() {
  const el = document.getElementById('menuClock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
updateClock();
setInterval(updateClock, 10000);

// ===== WINDOW MANAGEMENT =====
function openApp(appId) {
  // if already open, focus it
  if (openWindows[appId]) {
    focusWindow(openWindows[appId]);
    return;
  }

  const cfg = appConfig[appId];
  if (!cfg) return;

  const tpl = document.getElementById(cfg.tpl);
  if (!tpl) return;

  // create window
  const win = document.createElement('div');
  win.className = 'window';
  win.style.width  = cfg.w + 'px';
  win.style.zIndex = ++zTop;

  // random position (centered-ish)
  const dw = window.innerWidth;
  const dh = window.innerHeight - 108;
  const x  = Math.max(20, Math.min(dw - cfg.w - 20,  (dw - cfg.w)  / 2 + (Math.random() - 0.5) * 160));
  const y  = Math.max(10, Math.min(dh - cfg.h - 10,  (dh - cfg.h)  / 2 + (Math.random() - 0.5) * 100));
  win.style.left = x + 'px';
  win.style.top  = y + 'px';

  // title bar
  const titlebar = document.createElement('div');
  titlebar.className = 'win-titlebar';
  titlebar.innerHTML = `
    <div class="win-dots">
      <div class="win-dot red"    data-action="close"></div>
      <div class="win-dot yellow" data-action="min"></div>
      <div class="win-dot green"  data-action="max"></div>
    </div>
    <div class="win-title">${cfg.title}</div>
  `;

  // content
  const content = tpl.content.cloneNode(true);

  win.appendChild(titlebar);
  win.appendChild(content);
  document.getElementById('windows').appendChild(win);

  openWindows[appId] = win;

  // dock dot
  const dockItem = document.querySelector(`.dock-item[data-app="${appId}"]`);
  if (dockItem) dockItem.classList.add('open');

  // close button
  titlebar.querySelector('[data-action="close"]').addEventListener('click', () => closeWindow(appId));

  // focus on click
  win.addEventListener('mousedown', () => focusWindow(win));

  // dragging
  makeDraggable(win, titlebar);

  // init app content
  if (appId === 'notebook') initNotebook(win);
}

function closeWindow(appId) {
  const win = openWindows[appId];
  if (!win) return;
  win.style.animation = 'winClose 0.15s ease forwards';
  win.addEventListener('animationend', () => win.remove(), { once: true });
  delete openWindows[appId];
  const dockItem = document.querySelector(`.dock-item[data-app="${appId}"]`);
  if (dockItem) dockItem.classList.remove('open');
}

function focusWindow(win) {
  win.style.zIndex = ++zTop;
}

// add close animation keyframe
const style = document.createElement('style');
style.textContent = `@keyframes winClose { to { transform: scale(0.88); opacity: 0; } }`;
document.head.appendChild(style);

// ===== DRAG =====
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
    const nx = e.clientX - ox;
    const ny = e.clientY - oy;
    win.style.left = Math.max(0, Math.min(window.innerWidth  - win.offsetWidth,  nx)) + 'px';
    win.style.top  = Math.max(0, Math.min(window.innerHeight - win.offsetHeight, ny)) + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });
}

// ===== NOTEBOOK / GUESTBOOK =====
function initNotebook(win) {
  const messagesEl = win.querySelector('#nb-messages');
  const nameEl     = win.querySelector('#nb-name');
  const textEl     = win.querySelector('#nb-text');
  const sendBtn    = win.querySelector('#nb-send');

  // listen to Firestore
  const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'));
  const unsub = onSnapshot(q, snapshot => {
    if (snapshot.empty) {
      messagesEl.innerHTML = `<div class="nb-empty">还没有留言 ✨<br>成为第一个留言的人吧！</div>`;
      return;
    }
    messagesEl.innerHTML = '';
    snapshot.forEach(doc => {
      const d = doc.data();
      const div = document.createElement('div');
      div.className = 'nb-msg';
      const time = d.createdAt?.toDate
        ? d.createdAt.toDate().toLocaleDateString('zh-CN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
        : '刚刚';
      div.innerHTML = `
        <div class="nb-msg-header">
          <span class="nb-msg-name">${escHtml(d.name || '匿名')}</span>
          <span class="nb-msg-time">${time}</span>
        </div>
        <div class="nb-msg-text">${escHtml(d.text)}</div>
      `;
      messagesEl.appendChild(div);
    });
  });

  // clean up listener when window closes
  win.addEventListener('remove', unsub, { once: true });

  // send message
  sendBtn.addEventListener('click', async () => {
    const name = nameEl.value.trim() || '匿名';
    const text = textEl.value.trim();
    if (!text) return;

    sendBtn.disabled = true;
    sendBtn.textContent = '发送中...';

    try {
      await addDoc(collection(db, 'messages'), {
        name,
        text,
        createdAt: serverTimestamp()
      });
      textEl.value = '';
      nameEl.value = '';
    } catch (err) {
      alert('发送失败，请稍后再试');
      console.error(err);
    }

    sendBtn.disabled = false;
    sendBtn.textContent = '发送留言';
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ===== EVENTS =====
// Desktop icons (double click)
document.querySelectorAll('.icon').forEach(icon => {
  let clicks = 0;
  icon.addEventListener('click', () => {
    clicks++;
    if (clicks === 1) setTimeout(() => { clicks = 0; }, 300);
    if (clicks >= 2) { openApp(icon.dataset.app); clicks = 0; }
  });
});

// Dock icons (single click)
document.querySelectorAll('.dock-item').forEach(item => {
  item.addEventListener('click', () => openApp(item.dataset.app));
});
