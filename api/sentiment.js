const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

export default async function handler(req, res) {
  const out = { fearGreed: null, vix: null, naaim: null, aaii: null };

  await Promise.allSettled([

    // ── Fear & Greed (CNN) ──────────────────────────────
    fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { "User-Agent": UA }
    }).then(r => r.json()).then(d => {
      const s = d?.fear_and_greed;
      if (!s) return;
      const labelMap = {
        "Extreme Fear": "极度恐慌",
        "Fear": "恐慌",
        "Neutral": "中性",
        "Greed": "贪婪",
        "Extreme Greed": "极度贪婪"
      };
      out.fearGreed = {
        value: Math.round(s.score),
        label: labelMap[s.rating] || s.rating
      };
    }),

    // ── VIX (Yahoo Finance) ─────────────────────────────
    fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d", {
      headers: { "User-Agent": UA }
    }).then(r => r.json()).then(d => {
      const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price != null) out.vix = { value: +price.toFixed(2) };
    }),

    // ── NAAIM Exposure Index ─────────────────────────────
    fetch("https://www.naaim.org/programs/naaim-exposure-index/", {
      headers: { "User-Agent": UA }
    }).then(r => r.text()).then(html => {
      // 提取页面里的当前读数
      const patterns = [
        /This\s+Week[:\s\'\"]+([0-9]+\.?[0-9]*)/i,
        /Current\s+(?:Reading|Number)[:\s]+([0-9]+\.?[0-9]*)/i,
        /Exposure\s+Index[:\s]+([0-9]+\.?[0-9]*)/i,
        /"value"\s*:\s*([0-9]+\.?[0-9]*)/
      ];
      for (const re of patterns) {
        const m = html.match(re);
        if (m) { out.naaim = { value: +parseFloat(m[1]).toFixed(1) }; return; }
      }
    }),

    // ── AAII Sentiment Survey ────────────────────────────
    fetch("https://www.aaii.com/sentimentsurvey/sent_results", {
      headers: { "User-Agent": UA, "Accept": "*/*" }
    }).then(r => r.text()).then(text => {
      const lines = text.trim().split("\n").filter(l => l.trim() && !l.startsWith("Date"));
      if (!lines.length) return;
      const last = lines[lines.length - 1].split(",");
      if (last.length < 4) return;
      const bull = parseFloat(last[1]);
      const neutral = parseFloat(last[2]);
      const bear = parseFloat(last[3]);
      if (isNaN(bull)) return;
      // AAII 数据有时是 0-1 小数，有时是百分比整数
      const scale = bull < 2 ? 100 : 1;
      out.aaii = {
        bull: +(bull * scale).toFixed(1),
        neutral: +(neutral * scale).toFixed(1),
        bear: +(bear * scale).toFixed(1)
      };
    })

  ]);

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  res.json(out);
}
