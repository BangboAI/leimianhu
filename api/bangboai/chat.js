// BANGBOAI Chat API - Vercel Serverless Function
// Proxies requests to the BANGBOAI chat server

const API_SERVER = process.env.BANGBOAI_API_URL || "https://upstroke-shame-facecloth.ngrok-free.dev";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', server: 'BANGBOAI', message: 'Use POST method to chat' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    const response = await fetch(API_SERVER + '/api/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60000)
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(200).json({ 
      answer: 'BANGBOAI 暂时无法连接，请稍后再试。'
    });
  }
}
