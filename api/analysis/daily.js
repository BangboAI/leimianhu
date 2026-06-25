// BANGBOAI Daily Analysis Engine
// Fetches 赛盒ERP data and generates daily insights

const SAIBE_API = "https://gg16.irobotbox.com/Api/API_ProductInfoManage.asmx";
const SAIBE_AUTH = { customerId: "1502", username: "leimianhu@loeldeal.com", password: "LOELcase3322" };

function buildSoap(operation, bodyXml) {
  return '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><' +
    operation + ' xmlns="http://tempuri.org/">' + bodyXml + '</' + operation + '></soap:Body></soap:Envelope>';
}

function authXml() {
  return '<request><CustomerID>' + SAIBE_AUTH.customerId + '</CustomerID><UserName>' + SAIBE_AUTH.username + '</UserName><Password>' + SAIBE_AUTH.password + '</Password></request>';
}

async function callSaibe(operation, bodyXml, soapAction) {
  const soap = buildSoap(operation, bodyXml);
  try {
    const resp = await fetch(SAIBE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"http://tempuri.org/' + soapAction + '"'
      },
      body: soap
    });
    return await resp.text();
  } catch (e) {
    return '<Error>' + e.message + '</Error>';
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods': 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = (req.body && req.body.action) || (req.query && req.query.action) || 'daily';

  var result = { date: new Date().toISOString().slice(0, 10), status: 'ok', sections: [] };

  if (action === 'ping' || action === 'test') {
    // Test connection
    var checkResp = await callSaibe('CheckUserLogin', authXml(), 'CheckUserLogin');
    if (checkResp.indexOf('<Status>OK</Status>') >= 0) {
      result.connection = 'ok';
      result.user = '雷总';
    } else {
      result.connection = 'failed';
    }
  } else if (action === 'daily') {
    // Daily analysis
    result.sections.push({
      title: '📊 销售概况',
      data: '昨日销售数据获取中...',
      status: 'pending'
    });
    result.sections.push({
      title: '📦 库存预警',
      data: '库存数据获取中...',
      status: 'pending'
    });
    result.sections.push({
      title: '📢 广告效果',
      data: '广告数据获取中...',
      status: 'pending'
    });
    result.sections.push({
      title: '🔥 爆款推荐',
      data: '基于销售趋势分析中...',
      status: 'pending'
    });
    result.sections.push({
      title: '⚠️ 风险预警',
      data: '异常检测中...',
      status: 'pending'
    });
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(result);
}