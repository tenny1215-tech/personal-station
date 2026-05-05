const SYSTEM_PROMPT = `你是专业美股分析师，风格直接，数据驱动。通过网络搜索获取真实数据后，按以下格式输出。

输出第一行必须是（不加其他内容）：
SCORES:{"quality":X,"valuation":X,"momentum":X,"verdict":"BUY/HOLD/SELL/NEUTRAL","q_note":"ROE X% 毛利X%","v_note":"PE X倍 PEG X","m_note":"12m涨跌X%"}

然后用中文写分析（不超过500字）：

【公司】一句话说清楚主营业务和市场地位。

【质量 X/10】列出：ROE、毛利率、净利率、自由现金流、D/E，并给出1句评价。

【估值 X/10】列出：PE（含历史区间和行业均值）、PEG、分析师目标价中位数，并给出1句评价。

【趋势 X/10】列出：12个月涨幅 vs 标普500、是否站上200日均线、最近季报收入/EPS vs 预期、分析师评级分布，并给出1句评价。

【操作建议】直接说建不建议买，适合什么投资者，参考价位和建议仓位。

规则：数据必须真实，搜不到写"暂无"，不加免责声明。`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).end(); return; }

  const { ticker, context } = req.body || {};
  if (!ticker) { res.status(400).json({ error: "ticker required" }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "API key not configured" }); return; }

  try {
    const userMsg = context
      ? `请分析股票 ${ticker}。用户背景：${context}`
      : `请分析股票 ${ticker}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: userMsg }]
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
