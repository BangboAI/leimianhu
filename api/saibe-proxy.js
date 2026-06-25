// 赛盒ERP API Proxy - Vercel Serverless Function
// Proxies SOAP requests to the 赛盒ERP API to avoid CORS issues

export default async function handler(req, res) {
  const API = "https://gg16.irobotbox.com/Api/API_ProductInfoManage.asmx";
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, SOAPAction');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  try {
    const soapAction = req.headers['soapaction'] || '';
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    
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
    res.status(200).json({ Status: 'BadRequest', Msg: 'Proxy error: ' + e.message });
  }
}