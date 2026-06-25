// BANGBOAI Chat API - Vercel Serverless Function
// Proxies requests to the BANGBOAI chat server

const API_SERVER = process.env.BANGBOAI_API_URL || "https://upstroke-shame-facecloth.ngrok-free.dev";

const ANALYSIS_API = process.env.ANALYSIS_API_URL || "https://www.huaangel.com/api/analysis/daily";

async function callAnalysis(action) {
  try {
    const resp = await fetch(ANALYSIS_API + '?action=' + action, { signal: AbortSignal.timeout(15000) });
    return await resp.json();
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function handleAnalysisQuery(query, res) {
  // Map user queries to analysis actions
  var action = 'daily';
  if (/日报|今日|daily|分析/i.test(query)) action = 'daily';
  else if (/库存|stock/i.test(query)) action = 'inventory';
  else if (/广告|ads|advertising/i.test(query)) action = 'ads';
  else if (/爆款|hot|趋势|trend/i.test(query)) action = 'trends';
  else if (/预警|风险|risk|alert/i.test(query)) action = 'alerts';
  
  var result = await callAnalysis(action);
  var answer = formatAnalysisResult(result, action);
  return res.status(200).json({ answer: answer });
}

function formatAnalysisResult(result, action) {
  if (result.status === 'error') return '⚠️ 数据分析服务暂时不可用，请稍后再试。';
  
  var output = '📊 **BANGBOAI 每日分析**\n';
  output += '📅 ' + result.date + '\n\n';
  
  if (result.sections && result.sections.length) {
    result.sections.forEach(function(s) {
      output += '**' + s.title + '**\n';
      output += s.data + '\n\n';
    });
  }
  
  if (result.connection) {
    output += '✅ 赛盒ERP连接正常\n';
    output += '👤 ' + result.user + '\n';
  }
  
  output += '\n💡 *发送具体关键词查看更多：库存 | 广告 | 爆款 | 预警*';
  return output;
}

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

// Handle data import format: "import:sku,revenue,qty\nSKU001,29.99,5"
if (query && query.startsWith('import:')) {
  var lines = query.split('\n');
  var orders = [];
  for (var i = 1; i < lines.length; i++) {
    var parts = lines[i].split(',');
    if (parts.length >= 3) {
      orders.push({ sku: parts[0].trim(), totalPrice: parseFloat(parts[1]) || 0, qty: parseInt(parts[2]) || 1 });
    }
  }
  if (orders.length) {
    fetch("https://www.huaangel.com/api/analysis/daily", {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ data: { orders: orders, importedAt: new Date().toISOString() } })
    }).then(function(r){return r.json()}).then(function(d){
      if (d.status === 'ok') {
        var msg = '✅ 成功导入 ' + orders.length + ' 条订单数据\n输入「分析」查看结果';
        return res.status(200).json({ answer: msg });
      }
    }).catch(function(){});
    return res.status(200).json({ answer: '正在导入 ' + orders.length + ' 条数据...\n请输入「分析」查看结果' });
  }
}
if (/^(\u5BFC\u5165|\u6570\u636E|import|data)/i.test(query)) {
  return res.status(200).json({ answer: '请在聊天窗口中输入以下格式导入订单数据：\n\nimport:sku,revenue,qty\nSKU001,29.99,5\nSKU002,49.99,3\n\n每行一个商品，用逗号分隔。或输入「分析」查看结果' });
}

  if (query && (/^(日报|分析|库存|广告|爆款|预警|趋势|今日)/i.test(query))) {
  const analysisResp = await fetch("https://www.huaangel.com/api/analysis/daily?action=daily");
  const analysisData = await analysisResp.json();
  var answer = '📊 **BANGBOAI 每日经营分析**\n';
  answer += '📅 ' + analysisData.date + '\n\n';
  analysisData.sections.forEach(function(s) {
    answer += '**' + s.title + '**\n';
    answer += s.data + '\n\n';
  });
  answer += '💡 *如需详细数据请回复具体关键词：库存 | 广告 | 爆款 | 预警*';
  return res.status(200).json({ answer: answer });
}
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
