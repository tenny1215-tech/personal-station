export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }

  const {
    symbol = "BTCUSDT",
    strategy = "dca",
    startTime,
    endTime,
    amount = 100,
    frequency = "weekly",
    maPeriod = 200,
  } = req.body || {};

  try {
    const end = endTime ? parseInt(endTime) : Date.now();
    const start = startTime ? parseInt(startTime) : end - 365 * 24 * 60 * 60 * 1000;

    const candles = await fetchKlines(
      String(symbol).toUpperCase().replace("/", "").replace("-", ""),
      "1d",
      start,
      end
    );
    if (!candles.length) throw new Error("未获取到K线数据，请检查交易对名称");

    const ma = calcSMA(candles.map(c => c.close), parseInt(maPeriod));
    const maData = ma
      .map((v, i) => (v !== null ? { time: candles[i].time, value: +v.toFixed(2) } : null))
      .filter(Boolean);

    const freqDays = frequency === "monthly" ? 30 : 7;
    const FEE = 0.001;

    const result =
      strategy === "trend"
        ? runTrendDCA(candles, ma, +amount, freqDays, parseInt(maPeriod), FEE)
        : runDCA(candles, +amount, freqDays, FEE);

    res.json({ candles, maData, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function fetchKlines(symbol, interval, startTime, endTime) {
  const all = [];
  let from = startTime;

  while (from < endTime) {
    const params = new URLSearchParams({
      symbol,
      interval,
      startTime: String(from),
      endTime: String(endTime),
      limit: "1000",
    });

    const resp = await fetch(
      `https://api.binance.com/api/v3/klines?${params}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!resp.ok) throw new Error(`Binance API 错误: ${resp.status}`);
    const raw = await resp.json();
    if (raw.code) throw new Error(`Binance: ${raw.msg}`);
    if (!raw.length) break;

    all.push(
      ...raw.map(k => ({
        time: new Date(k[0]).toISOString().slice(0, 10),
        open: +parseFloat(k[1]).toFixed(4),
        high: +parseFloat(k[2]).toFixed(4),
        low: +parseFloat(k[3]).toFixed(4),
        close: +parseFloat(k[4]).toFixed(4),
        volume: +parseFloat(k[5]).toFixed(2),
      }))
    );

    if (raw.length < 1000) break;
    from = raw[raw.length - 1][0] + 1;
  }

  return all;
}

function calcSMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function runDCA(candles, amount, freqDays, fee) {
  const buys = [];
  let totalCoins = 0, totalInvested = 0, lastIdx = -freqDays;

  for (let i = 0; i < candles.length; i++) {
    if (i - lastIdx >= freqDays) {
      const price = candles[i].close;
      const coins = (amount * (1 - fee)) / price;
      totalCoins += coins;
      totalInvested += amount;
      lastIdx = i;
      buys.push({ date: candles[i].time, time: candles[i].time, price, amount, coins: +coins.toFixed(8), executed: true, reason: null });
    }
  }

  return buildResult(candles, buys, totalCoins, totalInvested);
}

function runTrendDCA(candles, ma, amount, freqDays, maPeriod, fee) {
  const buys = [];
  let totalCoins = 0, totalInvested = 0, lastIdx = -freqDays, skipped = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i - lastIdx >= freqDays) {
      lastIdx = i;
      const price = candles[i].close;
      const maVal = ma[i];

      if (maVal === null || price <= maVal) {
        skipped++;
        buys.push({
          date: candles[i].time, time: candles[i].time, price, amount, coins: 0,
          executed: false,
          reason: maVal === null ? `MA${maPeriod} 未形成` : `价格(${price}) ≤ MA${maPeriod}(${maVal.toFixed(2)})`,
        });
      } else {
        const coins = (amount * (1 - fee)) / price;
        totalCoins += coins;
        totalInvested += amount;
        buys.push({ date: candles[i].time, time: candles[i].time, price, amount, coins: +coins.toFixed(8), executed: true, reason: null });
      }
    }
  }

  return buildResult(candles, buys, totalCoins, totalInvested, skipped);
}

function buildResult(candles, buys, totalCoins, totalInvested, skipped = 0) {
  const lastClose = candles[candles.length - 1].close;
  const currentValue = totalCoins * lastClose;
  const totalReturn = totalInvested > 0 ? +((currentValue - totalInvested) / totalInvested * 100).toFixed(2) : 0;

  // max drawdown
  let peak = 0, maxDD = 0, runningCoins = 0, buyIdx = 0;
  const executed = buys.filter(b => b.executed);

  for (const c of candles) {
    while (buyIdx < executed.length && executed[buyIdx].time <= c.time) {
      runningCoins += executed[buyIdx].coins;
      buyIdx++;
    }
    const val = runningCoins * c.close;
    if (val > peak) peak = val;
    if (peak > 0) { const dd = (peak - val) / peak; if (dd > maxDD) maxDD = dd; }
  }

  return {
    buys,
    stats: {
      totalInvested: +totalInvested.toFixed(2),
      currentValue: +currentValue.toFixed(2),
      totalReturn,
      maxDrawdown: +(maxDD * 100).toFixed(2),
      executedCount: executed.length,
      skippedCount: skipped,
      totalCoins: +totalCoins.toFixed(8),
      avgBuyPrice: totalCoins > 0 ? +(totalInvested / totalCoins).toFixed(2) : 0,
      lastPrice: lastClose,
    },
  };
}
