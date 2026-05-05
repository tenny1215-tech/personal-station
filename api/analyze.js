const SYSTEM_PROMPT = `你是一个专业的美股选股分析助手。用户会给你一个股票代码，你需要通过网络搜索获取该股票的最新数据，然后基于以下框架给出结构化分析。

## 分析框架（三层筛选）

**第一关：质量（Quality）**
- ROE（股权回报率）：>15% 为良好，>25% 为优秀
- 毛利率：>40% 说明有护城河
- 负债率（D/E）：<50% 为健康

**第二关：估值（Valuation）**
- PEG 比率：<1.5 合理，<1 低估，>2 高估
- FCF 收益率（自由现金流/市值）：>3% 为良好
- 与历史估值区间对比

**第三关：趋势（Momentum）**
- 过去12个月涨跌幅
- 是否站上200日均线
- 近期基本面变化趋势

## 输出要求

首先给出三个评分，格式严格如下（必须在第一行，用JSON）：
SCORES:{"quality":X,"valuation":X,"momentum":X,"verdict":"BUY/HOLD/SELL/NEUTRAL"}
其中X为1-10的整数，verdict为大写英文。

然后换行，用中文写分析内容，包含：

【基本情况】
公司主营业务简介（2-3句）

【三关评估】
质量评分 X/10：[具体指标数据和评价]
估值评分 X/10：[当前估值水平和评价]
趋势评分 X/10：[近期走势和技术面评价]

【关键优势】
列出2-3个最重要的买入理由（如果有）

【主要风险】
列出2-3个需要警惕的风险点

【综合建议】
给出明确的操作建议，说明适合什么样的投资者、在什么条件下考虑买入/卖出/继续持有，以及建议的持仓比例控制。

注意：数据要尽量准确，引用具体数字；语言简洁直接；末尾不要加免责声明。`;

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
        max_tokens: 1200,
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
