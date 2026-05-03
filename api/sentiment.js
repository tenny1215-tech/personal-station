const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

export default async function handler(req, res) {
  const out = { fearGreed: null, vix: null, naaim: null, cryptoFG: null };

  await Promise.allSettled([

    // ── Fear & Greed (CNN) ──────────────────────────────
    fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { "User-Agent": UA }
    }).then(r => r.json()).then(d => {
      const s = d?.fear_and_greed;
      if (!s) return;
      const labelMap = {
        "extreme fear": "极度恐慌", "fear": "恐慌",
        "neutral": "中性", "greed": "贪婪", "extreme greed": "极度贪婪"
      };
      out.fearGreed = {
        value: Math.round(s.score),
        label: labelMap[(s.rating || "").toLowerCase()] || s.rating
      };
    }),

    // ── VIX：复用 price.js 的相同逻辑 ──────────────────
    fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX", {
      headers: { "User-Agent": "Mozilla/5.0" }
    }).then(r => r.json()).then(d => {
      const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price != null) out.vix = { value: +price.toFixed(2) };
    }),

    // ── NAAIM（不带 www，抓表格第一行数据）────────────
    fetch("https://naaim.org/programs/naaim-exposure-index/", {
      headers: { "User-Agent": UA },
      redirect: "follow"
    }).then(r => r.text()).then(html => {
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
          .map(m => m[1].replace(/<[^>]+>/g, "").trim());
        if (cells.length >= 2) {
          const val = parseFloat(cells[1]);
          if (!isNaN(val) && val > 0 && val <= 200) {
            out.naaim = { value: +val.toFixed(1) };
            return;
          }
        }
      }
    }),

    // ── Crypto Fear & Greed（全球风险偏好）────────────
    fetch("https://api.alternative.me/fng/", {
      headers: { "User-Agent": UA }
    }).then(r => r.json()).then(d => {
      const item = d?.data?.[0];
      if (!item) return;
      const labelMap = {
        "Extreme Fear": "极度恐慌", "Fear": "恐慌",
        "Neutral": "中性", "Greed": "贪婪", "Extreme Greed": "极度贪婪"
      };
      out.cryptoFG = {
        value: +item.value,
        label: labelMap[item.value_classification] || item.value_classification
      };
    })

  ]);

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  res.json(out);
}
