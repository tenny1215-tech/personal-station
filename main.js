import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── FIREBASE (同一个项目，复用配置) ──────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAfx9IxuT4hW7h24wY6IZ0TGW1pxqe5N-M",
  authDomain: "personal-station-810e7.firebaseapp.com",
  projectId: "personal-station-810e7",
  storageBucket: "personal-station-810e7.firebasestorage.app",
  messagingSenderId: "16967737691",
  appId: "1:16967737691:web:53834006c3a385a7b63a7e"
};
const db = getFirestore(initializeApp(firebaseConfig));

// ── 密码锁 ────────────────────────────────────────────────
const PASSWORD = "1215";
const SESSION_KEY = "ivt_auth";

function checkAuth() {
  return sessionStorage.getItem(SESSION_KEY) === "ok";
}

function unlock() {
  sessionStorage.setItem(SESSION_KEY, "ok");
  document.getElementById("lock-screen").style.display = "none";
  document.getElementById("app").style.display = "block";
  initApp();
}

document.getElementById("lock-btn").addEventListener("click", () => {
  const val = document.getElementById("lock-input").value;
  if (val === PASSWORD) {
    unlock();
  } else {
    document.getElementById("lock-error").textContent = "密码错误，请重试";
    document.getElementById("lock-input").value = "";
  }
});
document.getElementById("lock-input").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("lock-btn").click();
});
document.getElementById("logout-btn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});

if (checkAuth()) unlock();

// ── 工具函数 ──────────────────────────────────────────────
function f0(n) { return Number(n||0).toLocaleString("zh"); }
function f2(n) { return Number(n||0).toFixed(2); }
function pnlColor(n) { return n >= 0 ? "var(--green)" : "var(--red)"; }
function sign(n) { return n >= 0 ? "+" : ""; }
function today() { return new Date().toISOString().slice(0, 10); }

// ── 导航 ──────────────────────────────────────────────────
const pages = ["overview", "transfers", "holdings", "income"];

function showPage(name) {
  pages.forEach(p => {
    document.getElementById("page-" + p).classList.toggle("active", p === name);
    document.getElementById("nav-" + p).classList.toggle("active", p === name);
  });
}

// ── 弹窗 ──────────────────────────────────────────────────
function openModal(id) { document.getElementById("modal-" + id).classList.add("open"); }
function closeModal(id) { document.getElementById("modal-" + id).classList.remove("open"); }
function closeAll() { ["select","transfer","holding","income"].forEach(closeModal); }

// 点击遮罩关闭
["select","transfer","holding","income"].forEach(id => {
  const el = document.getElementById("modal-" + id);
  el.addEventListener("click", e => { if (e.target === el) closeModal(id); });
});

// ── 状态 ──────────────────────────────────────────────────
let transfers = {};
let holdings = {};
let income = {};

// ── 转账：Firebase 实时监听 ──────────────────────────────
function listenTransfers() {
  const q = query(collection(db, "transfers"), orderBy("date", "desc"));
  onSnapshot(q, snap => {
    transfers = {};
    snap.forEach(d => { transfers[d.id] = { id: d.id, ...d.data() }; });
    renderAll();
  });
}

// ── 持仓：Firebase 实时监听 ──────────────────────────────
function listenHoldings() {
  const q = query(collection(db, "holdings"), orderBy("date", "desc"));
  onSnapshot(q, snap => {
    holdings = {};
    snap.forEach(d => { holdings[d.id] = { id: d.id, ...d.data() }; });
    renderAll();
  });
}

// ── 收入：Firebase 实时监听 ──────────────────────────────
function listenIncome() {
  const q = query(collection(db, "income"), orderBy("date", "desc"));
  onSnapshot(q, snap => {
    income = {};
    snap.forEach(d => { income[d.id] = { id: d.id, ...d.data() }; });
    renderAll();
  });
}

// ── 转账表单 ──────────────────────────────────────────────
function resetTransferForm() {
  ["t-cny","t-rate","t-fx-fee","t-hsbc-fee","t-ibkr","t-note"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  document.getElementById("t-date").value = today();
  document.getElementById("t-preview").style.display = "none";
}

function calcPreview() {
  const cny = parseFloat(document.getElementById("t-cny").value)||0;
  const rate = parseFloat(document.getElementById("t-rate").value)||0;
  const fxFee = parseFloat(document.getElementById("t-fx-fee").value)||0;
  const hsbcFee = parseFloat(document.getElementById("t-hsbc-fee").value)||0;
  const ibkr = parseFloat(document.getElementById("t-ibkr").value)||0;
  const preview = document.getElementById("t-preview");
  if (!cny || !rate) { preview.style.display = "none"; return; }
  const usd = cny / rate;
  const totalFee = fxFee + hsbcFee;
  const arrived = ibkr || (usd - totalFee);
  const feeRate = usd > 0 ? (totalFee/usd*100).toFixed(2) : "0.00";
  document.getElementById("t-preview-content").innerHTML =
    `<div><div class="p-label">换汇得到</div><div class="p-value" style="color:var(--accent)">$${f2(usd)}</div></div>` +
    `<div><div class="p-label">总手续费</div><div class="p-value" style="color:var(--red)">-$${f2(totalFee)}</div></div>` +
    `<div><div class="p-label">实际到账</div><div class="p-value" style="color:var(--green)">$${f2(arrived)}</div></div>` +
    `<div><div class="p-label">手续费占比</div><div class="p-value" style="color:var(--yellow)">${feeRate}%</div></div>`;
  preview.style.display = "block";
}

async function saveTransfer() {
  const cny = parseFloat(document.getElementById("t-cny").value)||0;
  const rate = parseFloat(document.getElementById("t-rate").value)||0;
  const fxFee = parseFloat(document.getElementById("t-fx-fee").value)||0;
  const hsbcFee = parseFloat(document.getElementById("t-hsbc-fee").value)||0;
  const ibkr = parseFloat(document.getElementById("t-ibkr").value)||0;
  const date = document.getElementById("t-date").value;
  const note = document.getElementById("t-note").value;
  if (!cny||!rate) { alert("请填写人民币和汇率"); return; }
  if (!ibkr) { alert("请填写IBKR到账金额"); return; }
  const usdBefore = +(cny/rate).toFixed(2);
  const totalFee = +(fxFee + hsbcFee).toFixed(2);
  await addDoc(collection(db, "transfers"), {
    cny, rate, fxFee, hsbcFee, ibkr, totalFee, usdBefore, date, note,
    createdAt: serverTimestamp()
  });
  closeModal("transfer");
}

// ── 持仓表单 ──────────────────────────────────────────────
function resetHoldingForm() {
  document.getElementById("h-edit-id").value = "";
  ["h-ticker","h-name","h-price","h-shares","h-commission","h-current"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  document.getElementById("h-date").value = today();
  document.getElementById("h-type").value = "stock";
  document.getElementById("holding-modal-title").textContent = "买入股票";
}

async function saveHolding() {
  const editId = document.getElementById("h-edit-id").value;
  const ticker = (document.getElementById("h-ticker").value||"").toUpperCase().trim();
  const name = document.getElementById("h-name").value.trim();
  const price = parseFloat(document.getElementById("h-price").value)||0;
  const shares = parseFloat(document.getElementById("h-shares").value)||0;
  const commission = parseFloat(document.getElementById("h-commission").value)||0;
  const current = parseFloat(document.getElementById("h-current").value)||0;
  const date = document.getElementById("h-date").value;
  const type = document.getElementById("h-type").value;
  if (!ticker||!price||!shares) { alert("请填写代码、买入价和股数"); return; }
  if (editId) {
    await updateDoc(doc(db, "holdings", editId), { ticker,name,price,shares,commission,current,date,type });
  } else {
    await addDoc(collection(db, "holdings"), { ticker,name,price,shares,commission,current,date,type, createdAt: serverTimestamp() });
  }
  closeModal("holding");
}

async function updateCurrentPrice(id, val) {
  await updateDoc(doc(db, "holdings", id), { current: parseFloat(val)||0 });
}

async function deleteHolding(id) {
  if (!confirm("删除这条持仓？")) return;
  await deleteDoc(doc(db, "holdings", id));
}

async function deleteTransfer(id) {
  if (!confirm("删除这条转账记录？")) return;
  await deleteDoc(doc(db, "transfers", id));
}

// ── 收入表单 ──────────────────────────────────────────────
function resetIncomeForm() {
  ["i-ticker","i-amount","i-note"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  document.getElementById("i-date").value = today();
  document.getElementById("i-type").value = "interest";
}

async function saveIncome() {
  const type = document.getElementById("i-type").value;
  const ticker = (document.getElementById("i-ticker").value||"").toUpperCase().trim();
  const amount = parseFloat(document.getElementById("i-amount").value)||0;
  const date = document.getElementById("i-date").value;
  const note = document.getElementById("i-note").value;
  if (!amount) { alert("请填写金额"); return; }
  await addDoc(collection(db, "income"), { type,ticker,amount,date,note, createdAt: serverTimestamp() });
  closeModal("income");
}

async function deleteIncome(id) {
  if (!confirm("删除？")) return;
  await deleteDoc(doc(db, "income", id));
}

// ── 渲染 ──────────────────────────────────────────────────
function renderAll() {
  renderOverview();
  renderTransfers();
  renderHoldings();
  renderIncome();
}

function renderOverview() {
  const tArr = Object.values(transfers);
  const hArr = Object.values(holdings);
  const iArr = Object.values(income);
  const totalIBKR = tArr.reduce((s,t)=>s+t.ibkr,0);
  const totalCNY = tArr.reduce((s,t)=>s+t.cny,0);
  const totalFees = tArr.reduce((s,t)=>s+t.totalFee,0);
  const totalIncome = iArr.reduce((s,i)=>s+i.amount,0);
  const totalCost = hArr.reduce((s,h)=>s+(h.price*h.shares+(h.commission||0)),0);
  const totalMkt = hArr.reduce((s,h)=>s+((h.current||h.price)*h.shares),0);
  const totalPnL = totalMkt - totalCost;
  const totalReturn = totalIBKR>0 ? ((totalPnL+totalIncome)/totalIBKR*100) : 0;

  document.getElementById("overview-grid").innerHTML =
    `<div class="summary-card"><div class="summary-label">总入金 (IBKR)</div><div class="summary-value accent">$${f0(totalIBKR)}</div></div>` +
    `<div class="summary-card"><div class="summary-label">原始人民币</div><div class="summary-value">¥${f0(totalCNY)}</div></div>` +
    `<div class="summary-card"><div class="summary-label">持仓盈亏</div><div class="summary-value" style="color:${pnlColor(totalPnL)}">${sign(totalPnL)}$${f2(totalPnL)}</div></div>` +
    `<div class="summary-card"><div class="summary-label">利息/股息</div><div class="summary-value green">+$${f2(totalIncome)}</div></div>` +
    `<div class="summary-card"><div class="summary-label">转账手续费</div><div class="summary-value red">-$${f2(totalFees)}</div></div>` +
    `<div class="summary-card"><div class="summary-label">真实回报率</div><div class="summary-value" style="color:${pnlColor(totalReturn)}">${sign(totalReturn)}${f2(totalReturn)}%</div></div>`;

  document.getElementById("flow-summary").innerHTML = totalIBKR===0
    ? `<div style="color:var(--muted);font-size:14px;">还没有记录，点右下角 ＋ 开始</div>`
    : `<div style="font-size:13px;color:var(--muted);margin-bottom:8px;">共 ${tArr.length} 笔转账</div>` +
      `<div style="font-size:15px;font-weight:600;">¥${f0(totalCNY)} → <span style="color:var(--accent)">$${f2(totalIBKR)}</span> <span style="color:var(--red);font-size:13px">（手续费 -$${f2(totalFees)}）</span></div>`;

  document.getElementById("overview-holdings").innerHTML = hArr.length===0
    ? `<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">还没有持仓</div></div>`
    : hArr.map(h => {
        const cost = h.price*h.shares+(h.commission||0);
        const mkt = (h.current||h.price)*h.shares;
        const pnl = mkt-cost;
        const pct = cost>0 ? (pnl/cost*100) : 0;
        const tag = h.type==="bond-etf"?`<span class="tag tag-yellow">债券ETF</span>`:h.type==="etf"?`<span class="tag tag-blue">ETF</span>`:`<span class="tag tag-blue">股票</span>`;
        return `<div class="holding-card">
          <div class="holding-header">
            <div><div class="holding-ticker">${h.ticker} ${tag}</div><div class="holding-sub">${h.name||""} · ${h.shares}股</div></div>
            <div class="holding-pnl"><div class="amount" style="color:${pnlColor(pnl)}">${sign(pnl)}$${f2(pnl)}</div><div class="pct">${sign(pct)}${f2(pct)}%</div></div>
          </div>
        </div>`;
      }).join("");
}

function renderTransfers() {
  const el = document.getElementById("transfer-list");
  const arr = Object.values(transfers);
  if (arr.length===0) { el.innerHTML=`<div class="empty"><div class="empty-icon">💸</div><div class="empty-text">还没有转账记录<br>点右下角 ＋ 添加</div></div>`; return; }
  el.innerHTML = arr.map(t => {
    const feeRate = t.usdBefore>0 ? (t.totalFee/t.usdBefore*100).toFixed(2) : "0.00";
    return `<div class="transfer-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div style="font-size:15px;font-weight:700;color:var(--accent)">$${f2(t.ibkr)} 到账</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${t.date}${t.note?" · "+t.note:""}</div></div>
        <button class="btn-sm-danger" data-del-transfer="${t.id}">删除</button>
      </div>
      <div class="tm-grid">
        <div><div class="tm-label">人民币</div><div class="tm-value">¥${f0(t.cny)}</div></div>
        <div><div class="tm-label">汇率</div><div class="tm-value">${t.rate}</div></div>
        <div><div class="tm-label">换汇手续费</div><div class="tm-value" style="color:var(--red)">-$${f2(t.fxFee||0)}</div></div>
        <div><div class="tm-label">汇丰电汇费</div><div class="tm-value" style="color:var(--red)">-$${f2(t.hsbcFee||0)}</div></div>
        <div><div class="tm-label">总手续费</div><div class="tm-value" style="color:var(--red)">-$${f2(t.totalFee)}</div></div>
        <div><div class="tm-label">手续费占比</div><div class="tm-value" style="color:var(--yellow)">${feeRate}%</div></div>
      </div>
    </div>`;
  }).join("");
  el.querySelectorAll("[data-del-transfer]").forEach(btn => {
    btn.addEventListener("click", () => deleteTransfer(btn.dataset.delTransfer));
  });
}

function renderHoldings() {
  const el = document.getElementById("holdings-list");
  const arr = Object.values(holdings);
  if (arr.length===0) { el.innerHTML=`<div class="empty"><div class="empty-icon">📈</div><div class="empty-text">还没有持仓记录<br>点右下角 ＋ 添加</div></div>`; return; }
  el.innerHTML = arr.map(h => {
    const cost = h.price*h.shares+(h.commission||0);
    const mkt = (h.current||h.price)*h.shares;
    const pnl = mkt-cost;
    const pct = cost>0?(pnl/cost*100):0;
    const typeLabel = h.type==="bond-etf"?"债券ETF":h.type==="etf"?"ETF":"股票";
    const tagCls = h.type==="bond-etf"?"tag-yellow":"tag-blue";
    return `<div class="holding-card">
      <div class="holding-header">
        <div><div class="holding-ticker">${h.ticker} <span class="tag ${tagCls}">${typeLabel}</span></div>
        <div class="holding-sub">${h.name||""} · ${h.date}</div></div>
        <div class="holding-pnl"><div class="amount" style="color:${pnlColor(pnl)}">${sign(pnl)}$${f2(pnl)}</div><div class="pct">${sign(pct)}${f2(pct)}%</div></div>
      </div>
      <div class="hd-grid">
        <div class="hd-item"><div class="hd-label">买入价</div><div class="hd-value">$${f2(h.price)}</div></div>
        <div class="hd-item"><div class="hd-label">股数</div><div class="hd-value">${h.shares}</div></div>
        <div class="hd-item"><div class="hd-label">总成本</div><div class="hd-value">$${f2(cost)}</div></div>
        <div class="hd-item"><div class="hd-label">当前价</div><div class="hd-value" style="color:var(--accent)">$${f2(h.current||h.price)}</div></div>
        <div class="hd-item"><div class="hd-label">市值</div><div class="hd-value">$${f2(mkt)}</div></div>
        <div class="hd-item"><div class="hd-label">佣金</div><div class="hd-value" style="color:var(--red)">$${f2(h.commission||0)}</div></div>
      </div>
      <div class="price-row">
        <input type="number" placeholder="更新当前价格" step="0.01" value="${h.current||""}" data-price-id="${h.id}">
        <button class="btn-sm-ghost" data-edit-id="${h.id}">编辑</button>
        <button class="btn-sm-danger" data-del-holding="${h.id}">删除</button>
      </div>
    </div>`;
  }).join("");

  el.querySelectorAll("[data-price-id]").forEach(input => {
    input.addEventListener("change", () => updateCurrentPrice(input.dataset.priceId, input.value));
  });
  el.querySelectorAll("[data-edit-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const h = holdings[btn.dataset.editId];
      if (!h) return;
      document.getElementById("h-edit-id").value = h.id;
      document.getElementById("h-ticker").value = h.ticker;
      document.getElementById("h-name").value = h.name||"";
      document.getElementById("h-price").value = h.price;
      document.getElementById("h-shares").value = h.shares;
      document.getElementById("h-commission").value = h.commission||"";
      document.getElementById("h-current").value = h.current||"";
      document.getElementById("h-date").value = h.date;
      document.getElementById("h-type").value = h.type||"stock";
      document.getElementById("holding-modal-title").textContent = "编辑持仓";
      openModal("holding");
    });
  });
  el.querySelectorAll("[data-del-holding]").forEach(btn => {
    btn.addEventListener("click", () => deleteHolding(btn.dataset.delHolding));
  });
}

function renderIncome() {
  const el = document.getElementById("income-list");
  const arr = Object.values(income);
  const total = arr.reduce((s,i)=>s+i.amount,0);
  if (arr.length===0) { el.innerHTML=`<div class="empty"><div class="empty-icon">💰</div><div class="empty-text">还没有收入记录<br>点右下角 ＋ 添加</div></div>`; return; }
  const typeLabel = {interest:"利息",dividend:"股息",other:"其他"};
  const tagCls = {interest:"tag-green",dividend:"tag-blue",other:"tag-yellow"};
  el.innerHTML =
    `<div class="card" style="margin-bottom:16px;"><div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--muted)">总收入</span><span style="font-size:20px;font-weight:700;color:var(--green)">+$${f2(total)}</span></div></div>` +
    arr.map(i => `<div class="income-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-weight:700">${i.ticker||"—"}</span>
            <span class="tag ${tagCls[i.type]}">${typeLabel[i.type]}</span>
          </div>
          <div style="font-size:12px;color:var(--muted)">${i.date}${i.note?" · "+i.note:""}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px;font-weight:700;color:var(--green)">+$${f2(i.amount)}</span>
          <button class="btn-sm-danger" data-del-income="${i.id}">删除</button>
        </div>
      </div>
    </div>`).join("");
  el.querySelectorAll("[data-del-income]").forEach(btn => {
    btn.addEventListener("click", () => deleteIncome(btn.dataset.delIncome));
  });
}

// ── 初始化 ────────────────────────────────────────────────
function initApp() {
  // 导航
  document.getElementById("nav-overview").addEventListener("click", () => showPage("overview"));
  document.getElementById("nav-transfers").addEventListener("click", () => showPage("transfers"));
  document.getElementById("nav-holdings").addEventListener("click", () => showPage("holdings"));
  document.getElementById("nav-income").addEventListener("click", () => showPage("income"));

  // FAB
  document.getElementById("fab").addEventListener("click", () => openModal("select"));

  // 选择弹窗
  document.getElementById("btn-add-transfer").addEventListener("click", () => { closeAll(); resetTransferForm(); openModal("transfer"); });
  document.getElementById("btn-add-holding").addEventListener("click", () => { closeAll(); resetHoldingForm(); openModal("holding"); });
  document.getElementById("btn-add-income").addEventListener("click", () => { closeAll(); resetIncomeForm(); openModal("income"); });
  document.getElementById("btn-cancel-select").addEventListener("click", () => closeModal("select"));

  // 转账弹窗
  document.getElementById("btn-transfer-cancel").addEventListener("click", () => closeModal("transfer"));
  document.getElementById("btn-transfer-save").addEventListener("click", saveTransfer);
  ["t-cny","t-rate","t-fx-fee","t-hsbc-fee","t-ibkr"].forEach(id => {
    document.getElementById(id).addEventListener("input", calcPreview);
  });

  // 持仓弹窗
  document.getElementById("btn-holding-cancel").addEventListener("click", () => closeModal("holding"));
  document.getElementById("btn-holding-save").addEventListener("click", saveHolding);

  // 收入弹窗
  document.getElementById("btn-income-cancel").addEventListener("click", () => closeModal("income"));
  document.getElementById("btn-income-save").addEventListener("click", saveIncome);

  // Firebase 监听
  listenTransfers();
  listenHoldings();
  listenIncome();
}
