const SYSTEM_PROMPT = `你是专业美股分析师，风格直接，数据驱动。用户会提供股票的实时财务数据，你基于这些数据给出分析。

输出第一行必须是（不加其他内容）：
SCORES:{"quality":X,"valuation":X,"momentum":X,"verdict":"BUY/HOLD/SELL/NEUTRAL","q_note":"ROE X% 毛利X%","v_note":"PE X倍 PEG X","m_note":"12m涨跌X%"}

X为1-10整数，verdict为操作建议（BUY=建议买入，HOLD=建议持有，SELL=建议卖出，NEUTRAL=中性观望）。

然后用中文写分析：

【公司】一句话说清楚主营业务和市场地位。

【质量 X/10】
ROE：X%  毛利率：X%  净利率：X%  自由现金流：X  负债率D/E：X
→ [1句评价，说明护城河强弱]

【估值 X/10】
PE：X倍（52周区间内高低位对比）  PEG：X  市值：$X
→ [1句评价，说贵还是便宜]

【趋势 X/10】
近12个月涨幅：X%（与标普500比）  52周高低：$X–$X  当前价：$X
→ [1句评价，说动能强弱]

【核心逻辑】
- 最大亮点（附数据）
- 最大风险（附情景）

【操作建议】
直接说建不建议买，适合什么投资者，参考价位和建议仓位。如果用户提供了持仓背景，针对性回答。

规则：基于提供的数据分析，数据缺失写"暂无"，不加免责声明，不废话。`;

async function fetchYahooData(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
  const url2 = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=summaryDetail,financialData,defaultKeyStatistics,price`;

  const [chartRes, summaryRes] = await Promise.all([
    fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }),
    fetch(url2, { headers: { "User-Agent": "Mozilla/5.0" } })
  ]);

  const chart = await chartRes.json();
  const summary = await summaryRes.json();

  const q = summary?.quoteSummary?.result?.[0] || {};
  const price = q.price || {};
  const fin = q.financialData || {};
  const stats = q.defaultKeyStatistics || {};
  const detail = q.summaryDetail || {};

  const closes = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
  const firstClose = closes.find(v => v != null);
  const lastClose = closes[closes.length - 1];
  const change12m = firstClose && lastClose ? ((lastClose - firstClose) / firstClose * 100).toFixed(2) : null;

  const fmt = (v, suffix = "") => v?.raw != null ? `${v.raw.toLocaleString()}${suffix}` : "暂无";
  const pct = v => v?.raw != null ? `${(v.raw * 100).toFixed(2)}%` : "暂无";

  return {
    ticker: ticker.toUpperCase(),
    name: price.longName || price.shortName || ticker,
    currentPrice: fmt(price.regularMarketPrice, ""),
    currency: price.currency || "USD",
    marketCap: price.marketCap?.raw ? `$${(price.marketCap.raw / 1e9).toFixed(1)}B` : "暂无",
    change12m: change12m ? `${change12m}%` : "暂无",
    week52High: fmt(detail.fiftyTwoWeekHigh),
    week52Low: fmt(detail.fiftyTwoWeekLow),
    pe: fmt(detail.trailingPE),
    forwardPE: fmt(detail.forwardPE),
    peg: fmt(stats.pegRatio),
    eps: fmt(stats.trailingEps),
    roe: pct(fin.returnOnEquity),
    grossMargin: pct(fin.grossMargins),
    operatingMargin: pct(fin.operatingMargins),
    profitMargin: pct(fin.profitMargins),
    debtToEquity: fin.debtToEquity?.raw != null ? fin.debtToEquity.raw.toFixed(2) : "暂无",
    freeCashflow: fin.freeCashflow?.raw ? `$${(fin.freeCashflow.raw / 1e9).toFixed(2)}B` : "暂无",
    revenueGrowth: pct(fin.revenueGrowth),
    earningsGrowth: pct(fin.earningsGrowth),
    targetMeanPrice: fmt(fin.targetMeanPrice),
    recommendation: fin.recommendationKey || "暂无",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).end(); return; }

  const { ticker, context } = req.body || {};
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "API key not configured" }); return; }

  try {
    let stockData;
    try {
      stockData = await fetchYahooData(ticker);
    } catch (e) {
      stockData = { ticker: ticker.toUpperCase(), error: "财务数据获取失败：" + e.message };
    }

    const dataBlock = JSON.stringify(stockData, null, 2);
    const userMsg = `股票代码：${ticker}\n\n实时财务数据：\n${dataBlock}${context ? `\n\n用户背景：${context}` : ""}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }]
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
