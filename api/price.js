export default async function handler(req, res) {
  const { ticker } = req.query;
  if (!ticker) { res.json({ price: null }); return; }
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const data = await r.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
    res.json({ price });
  } catch(e) {
    res.json({ price: null, error: e.message });
  }
}
