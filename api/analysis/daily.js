let storedData = null;
const MIN_SALES = 3;

function analyze(data) {
  var output = { profit: [], hot: [], alerts: [], ads: [], trends: [] };
  
  if (!data || !data.orders || !data.orders.length) {
    return { error: "暂无数据，请先导入订单数据", empty: true };
  }
  
  var orders = data.orders;
  var totalRevenue = 0, totalOrders = 0;
  var skuMap = {};
  
  orders.forEach(function(order) {
    totalRevenue += parseFloat(order.totalPrice || order.price || 0);
    totalOrders++;
    var sku = order.sku || order.SKU || "UNKNOWN";
    if (!skuMap[sku]) skuMap[sku] = { qty: 0, revenue: 0, orders: 0 };
    skuMap[sku].qty += parseInt(order.qty || order.quantity || 1);
    skuMap[sku].revenue += parseFloat(order.totalPrice || order.price || 0);
    skuMap[sku].orders++;
  });

  var sorted = Object.keys(skuMap).map(function(sku) {
    return { sku: sku, qty: skuMap[sku].qty, rev: skuMap[sku].revenue, orders: skuMap[sku].orders };
  }).sort(function(a, b) { return b.qty - a.qty; });

  var topSKUs = sorted.slice(0, 10);
  var lowSKUs = sorted.filter(function(s) { return s.qty <= MIN_SALES && s.qty > 0; });

  output.profit = { totalRevenue: totalRevenue, totalOrders: totalOrders, avgOrder: (totalRevenue / totalOrders).toFixed(2), topSKUs: topSKUs };
  output.hot = { topSKUs: topSKUs.slice(0, 5) };
  output.alerts = { lowPerformers: lowSKUs };
  output.empty = false;
  return output;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST' && req.body && req.body.data) {
    storedData = req.body.data;
    return res.status(200).json({ status: 'ok', msg: '数据已存储' });
  }

  var action = req.query.action || 'daily';
  var result = { date: new Date().toISOString().slice(0, 10), status: 'ok', sections: [] };

  if (!storedData) {
    result.sections.push({ title: '⚠️', data: '尚无数据，请先通过聊天窗口导入订单数据', status: 'nodata' });
  } else {
    var analysis = analyze(storedData);
    if (analysis.empty) {
      result.sections.push({ title: '⚠️', data: '数据格式有问题，请确保导入正确的CSV格式', status: 'error' });
    } else {
      if (analysis.profit) {
        var profit = analysis.profit;
        result.sections.push({
          title: '📊 销售概况',
          data: '总营收: $' + profit.totalRevenue.toFixed(2) + ' \n订单数: ' + profit.totalOrders + ' \n平均客单价: $' + profit.avgOrder + ' \n\n★ 第一热卖SKU: ' + (profit.topSKUs[0] ? profit.topSKUs[0].sku + ' (' + profit.topSKUs[0].qty + '件)' : '无'),
          status: 'ok'
        });
      }
      if (analysis.hot) {
        var hotList = analysis.hot.topSKUs.map(function(s) { return s.sku + ' (' + s.qty + '件, $' + s.rev.toFixed(0) + ')'; }).join('\n');
        result.sections.push({ title: '🔥 爆款商品', data: hotList || '暂无明显爆款', status: 'ok' });
      }
      if (analysis.alerts) {
        var alertList = analysis.alerts.lowPerformers.map(function(s) { return s.sku + '（仅' + s.qty + '件）'; }).join('\n');
        result.sections.push({ title: '⚠️ 风险提示', data: '下列商品销量偏低，建议检查是否需要调整LLCFFA策略：\n' + (alertList || '无'), status: 'ok' });
      }
      result.sections.push({ title: '📢 广告分析', data: '尚未导入广告数据，请导入后查看', status: 'pending' });
    }
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(result);
}