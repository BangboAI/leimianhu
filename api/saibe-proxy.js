// 赛盒ERP API Proxy
export default async function handler(req, res) {
  const API = "https://gg16.irobotbox.com/Api/API_ProductInfoManage.asmx";
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, SOAPAction');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Read body - Vercel may or may not parse XML body
  let body = '';
  if (typeof req.body === 'string') {
    body = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    body = req.body.toString('utf-8');
  } else if (typeof req.body === 'object' && req.body !== null) {
    // Try to stringify - might be a parsed object
    try { body = JSON.stringify(req.body); } catch(e) { body = String(req.body); }
  } else {
    // Read from request stream as fallback
    body = await new Promise(function(resolve) {
      var chunks = [];
      req.on('data', function(chunk) { chunks.push(chunk); });
      req.on('end', function() { resolve(Buffer.concat(chunks).toString('utf-8')); });
    });
  }

  var soapAction = req.headers['soapaction'] || '';

  try {
    const resp = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': soapAction
      },
      body: body
    });
    
    const text = await resp.text();
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ Status: 'BadRequest', Msg: 'Proxy error: ' + e.message });
  }
}