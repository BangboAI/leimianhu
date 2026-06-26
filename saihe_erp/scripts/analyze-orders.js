#!/usr/bin/env node
/**
 * 赛盒ERP (irobotbox) Order Analyzer
 * 
 * Usage:
 *   node scripts/analyze-orders.js [--host HOST] [--cid CID] [--user USER] [--pass PASS] [--days 30] [--format json|text]
 * 
 * Environment variables (fallback):
 *   SAIHE_HOST, SAIHE_CUSTOMER_ID, SAIHE_USERNAME, SAIHE_PASSWORD
 * 
 * Platforms analyzed (ordered by OrderSourceType):
 *   Amazon(1), Walmart(45), TikTok(104), Etsy(57), Ozon(122), Shopify(50)
 */
const https = require('https');
const cm = require('./cost-model.js');
const args = process.argv.slice(2);
function getPlatform(storeName){var n=storeName||"";if(/walmart|WALMART/.test(n))return"Walmart";if(/amazon|AMAZON|BANGBO/.test(n))return"Amazon";if(/TK$/.test(n)||/TikTok/.test(n))return"TikTok";if(/etzy|Etsy/.test(n))return"Etsy";if(/ozon|Ozon/.test(n))return"Ozon";if(/shopify|Shopify/.test(n))return"Shopify";return"Other";}
function getArg(flag, env, def) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : (process.env[env] || def);
}
const CONFIG = {
  host: getArg('--host', 'SAIHE_HOST', 'gg16.irobotbox.com'),
  customerId: getArg('--cid', 'SAIHE_CUSTOMER_ID', '1502'),
  username: getArg('--user', 'SAIHE_USERNAME', ''),
  password: getArg('--pass', 'SAIHE_PASSWORD', ''),
  days: parseInt(getArg('--days', 'SAIHE_DAYS', '30')),
  format: getArg('--format', 'SAIHE_FORMAT', 'text'),
};
const PLATFORMS = [
  { type: '1', name: 'Amazon' },
  { type: '45', name: 'Walmart' },
  { type: '104', name: 'TikTok' },
  { type: '57', name: 'Etsy/Loeldeal' },
  { type: '122', name: 'Ozon' },
  { type: '50', name: 'Shopify' },
];
const CATEGORIES = {
  light: [/灯|lamp|light|lumièr|lumin|照明|フォグ|作業灯|ライト|led|lämp|luc|luce|fog|driving|work.?light|bracket/],
  bag: [/bag|backpack|crossbody|sling|waist|pouch|borsa|zaino|bolsa|mochila|sac|bandouliere|banane|sacoche|tote|rucksack|drawstring|gym/],
  accessory: [/wallet|credit.?card|card.?case|key.?case|キーケース|札入れ|財布|小銭入れ|カード|purse|billfold|trifold/],
  electronic: [/hdmi|dp.*変換|充電|cable|ケーブル|usb|charger|adapter/],
  girls_apparel: [/princess|tulle|gown|unicorn|fairy|flower.?girl|ballet|tutu|bike.?short|bra|padded.?bra|crop.?top|girl.*dress|girls.*short|girl.*leggings|soft.*cotton.*training.*bra/i],
  boys_apparel: [/boy.*(short|athletic|tank|sleeve|pant|shirt)/i, /7.?pack.*boy|toddler.*boy|athletic.*short.*toddler/i],
  swimwear: [/swim|swimsuit|bikini|rash.?guard|tankini|swimwear|plus.?size.*swim|swimdress/i],
  socks: [/compression.?sock|knee.?high|support.*hose/i],
  underwear: [/underwear|boxer|underpants|brief/i],
  kids_costume: [/costume|halloween|dress.?up/i],
};

const CATEGORY_LABELS = {
  light: "LED Lights", bag: "Bags", girls_apparel: "Girls Apparel", boys_apparel: "Boys Apparel",
  accessory: "Wallets", swimwear: "Swimwear", electronic: "Electronics",
  socks: "Compression Socks", underwear: "Underwear", kids_costume: "Kids Costumes", other: "Other",
};

// How many base currency units = 1 USD (JPY=150 means 150 yen = 1 USD)
const FX_RATES = { USD: 1, EUR: 0.91, JPY: 150, GBP: 0.79, CAD: 1.37, MXN: 20, AUD: 1.5 };
function callSoap(host, path, soapAction, soapBody) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: host, path, method: 'POST', rejectUnauthorized: false,
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': soapAction, 'Content-Length': Buffer.byteLength(soapBody) }
      },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }
    );
    req.on('error', reject);
    req.write(soapBody);
    req.end();
  });
}
function buildSoap(cid, user, pass, st, et, src, nt) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body><GetOrders xmlns="http://tempuri.org/"><orderRequest>
    <CustomerID>${cid}</CustomerID><UserName>${user}</UserName><Password>${pass}</Password>
    <StartTime>${st}</StartTime><EndTime>${et}</EndTime>
    <OrderSourceType>${src}</OrderSourceType><NextToken>${nt}</NextToken>
  </orderRequest></GetOrders></soap:Body>
</soap:Envelope>`;
}
function parseOrders(xml) {
  const orders = [];
  const blocks = xml.split('<ApiOrderInfo>');
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i].split('</ApiOrderInfo>')[0];
    const tp = parseFloat(extract(b, 'TotalPrice')) || 0;
    if (tp <= 0) continue;
    const store = extract(b, 'OrderSourceName');const isFBA = extract(b, 'IsFBAOrder') === 'true';
    const currency = extract(b, 'Currency');
    const items = b.split('<ApiOrderList>');
    for (let j = 1; j < items.length; j++) {
      const ib = items[j].split('</ApiOrderList>')[0];
      const sku = extract(ib, 'SKU');
      if (!sku) continue;
      orders.push({
        sku, clientSku: extract(ib, 'ClientSKU'), sellerSku: extract(ib, 'SellerSKU'),
        asin: extract(ib, 'ASIN'), title: extract(ib, 'ItemTitle').substring(0,120),
        links: extract(ib, 'ProductLinks'),
        qty: parseInt(extract(ib, 'ProductNum')) || 0,
        price: parseFloat(extract(ib, 'ProductPrice')) || 0,
        cost: parseFloat(extract(ib, 'LastBuyPrice')) || 0,
        store, currency,
      });
    }
  }
  return orders;
}
function extract(xml, tag) {
  const m = xml.match(new RegExp('<'+tag+'>([^<]*)<\\/'+tag+'>'));
  return m ? m[1].trim() : '';
}
function classifyProduct(title, sku) {
  const t = (title + ' ' + (sku||'')).toLowerCase();
  for (const [cat, pats] of Object.entries(CATEGORIES))
    for (const p of pats) if (p.test(t)) return cat;
  return 'other';
}
function toUsd(amount, cc) { return amount / (FX_RATES[cc]||1); }
function analyze(orders) {
  const bySku={}, byStore={}, byCat={};
  for (const o of orders) {
    const rev = o.price * o.qty;
    const usd = toUsd(rev, o.currency);
    if (!bySku[o.sku]) bySku[o.sku]={sku:o.sku,cs:o.clientSku,asin:o.asin,ti:o.title,ct:o.cost,cat:o.category,stores:{},plats:{},q:0,rev:0,usd:0,oc:0};
    const p=bySku[o.sku]; p.q+=o.qty; p.rev+=rev; p.usd+=usd; p.oc++;if(!p.cat)p.cat=o.category;
    p.stores[o.store]=(p.stores[o.store]||0)+o.qty;
    p.plats[o.store.replace(/\(.*\)/,'').trim()]=1;
    if(!p.ti&&o.title)p.ti=o.title; if(!p.asin&&o.asin)p.asin=o.asin; if(o.cost>0)p.ct=o.cost;
    if(!byStore[o.store])byStore[o.store]={usd:0,q:0,oc:0,catRev:{}};
    const s=byStore[o.store]; s.usd+=usd; s.q+=o.qty; s.oc++;
    const cat=classifyProduct(o.title,o.clientSku);
if(!byCat[cat]) byCat[cat]={};
    if(!byCat[cat][o.sku])byCat[cat][o.sku]={sku:o.sku,cs:o.clientSku,asin:o.asin,ti:o.title,ct:o.cost,q:0,usd:0,stores:{},plats:{}};
    const cp=byCat[cat][o.sku]; cp.q+=o.qty; cp.usd+=usd; cp.stores[o.store]=(cp.stores[o.store]||0)+o.qty;
    cp.plats[o.store.replace(/\(.*\)/,'').trim()]=1;
    if(!cp.ti&&o.title)cp.ti=o.title; if(o.cost>0)cp.ct=o.cost;
    if(!byStore[o.store].catRev[cat])byStore[o.store].catRev[cat]=0;
    byStore[o.store].catRev[cat]+=usd;
  }
  const ranked=Object.values(bySku).sort((a,b)=>b.usd-a.usd);
  const sRanked=Object.entries(byStore).sort((a,b)=>b[1].usd-a[1].usd);
const cSummary={};
for(const[cat,items]of Object.entries(byCat)){
const arr=Object.values(items);
const stores={};
for(const p of arr)for(const s of Object.keys(p.stores))stores[s]=1;
cSummary[cat]={usd:arr.reduce((s,p)=>s+p.usd,0),units:arr.reduce((s,p)=>s+p.q,0),skus:arr.length,stores:Object.keys(stores).length};
}
  const storeCatMatrix={};
for(const[s,info]of sRanked.slice(0,10)){
  storeCatMatrix[s]=Object.entries(info.catRev||{}).sort((a,b)=>b[1]-a[1]).slice(0,3);
}
const cross=Object.values(bySku).filter(p=>Object.keys(p.plats).length>1).sort((a,b)=>b.usd-a.usd);
  const margin=Object.values(bySku).filter(p=>p.ct>0&&p.q>0).map(p=>({...p,m:(p.usd-p.ct*p.q)/p.usd})).filter(p=>p.m>0.6).sort((a,b)=>b.usd-a.usd);
  return {total:orders.length,usdTotal:orders.reduce((s,o)=>s+toUsd(o.price*o.qty,o.currency),0),unique:Object.keys(bySku).length,ranked,sRanked,cSummary,storeCatMatrix,cross:cross.slice(0,15),hmargin:margin.slice(0,15)};
}
function fmtReport(r, prevR, platName) {
  let l = [];
  l.push(''); l.push('========================================');
  l.push('  赛盒ERP订单数据分析报告');
  l.push('  平台: ' + platName);
  l.push('  周期: 过去' + CONFIG.days + '天');
  l.push('========================================'); l.push('');
  l.push('总条数: ' + r.total);
  l.push('总营收USD: $' + r.usdTotal.toFixed(2));
  l.push('唯一SKU: ' + r.unique); l.push('');
  l.push('--- 店铺营收排名 ---');
  l.push(""); l.push("--- Category Analysis (v2) ---");
  r.sRanked.slice(0,15).forEach(function(storeInfo, idx) {
    var s = storeInfo[0], d = storeInfo[1];
    var storeTrend = '';
    if (prevR) {
      var ps = prevR.sRanked.find(function(si) { return si[0] === s; });
      if (ps) { var chg = ((d.usd - ps[1].usd) / ps[1].usd * 100).toFixed(1); storeTrend = (chg > 0 ? " +" : " ") + chg + "%"; } else { storeTrend = " NEW"; }
    }
    l.push('  ' + (idx+1) + '. ' + s.padEnd(22) + '$' + d.usd.toFixed(2).padStart(9) + ' (' + d.q + '?)' + storeTrend);
  });
  l.push("Category".padEnd(20) + "Revenue".padEnd(12) + "%   SKU  Units Stores  Trend");
  var catSorted = Object.entries(r.cSummary).sort(function(a,b) { return b[1].usd - a[1].usd; });
  catSorted.forEach(function(catInfo) {
    var cat = catInfo[0], info = catInfo[1];
    var lb = (CATEGORY_LABELS[cat] || cat).padEnd(20);
    var pct = (info.usd / r.usdTotal * 100).toFixed(1);
    var trend = '';
    if (prevR && prevR.cSummary && prevR.cSummary[cat]) {
      var chg = ((info.usd - prevR.cSummary[cat].usd) / prevR.cSummary[cat].usd * 100).toFixed(0);
      trend = (chg > 0 ? '+' : '') + chg + '%';
    }
    l.push("  " + lb + "$" + info.usd.toFixed(0).padStart(7) + " " + pct.padStart(5) + "%  " + String(info.skus).padStart(4) + " " + String(info.units).padStart(5) + " " + String(info.stores).padStart(4) + "  " + trend);
  });
  l.push(''); l.push('--- TOP15高潜产品 ---');
  l.push('排名|SKU|ClientSKU|ASIN|标题|销量|营收USD|利润|覆盖');
  r.ranked.slice(0,15).forEach((p,i)=>{
    const profit=p.usd-p.ct*p.q;
    const sts=Object.keys(p.stores).slice(0,2).join(',');
    const ti=(p.ti||p.cs||p.sku).replace(/[,;]/g,' ').substring(0,40);
    l.push('  '+(i+1)+'|'+p.sku+'|'+(p.cs||'-')+'|'+(p.asin||'-')+'|'+ti+'|'+p.q+'|$'+p.usd.toFixed(2)+'|$'+profit.toFixed(2)+'|'+sts);
  });
  if(r.cross.length>0){
    l.push(''); l.push('--- 跨平台SKU(可复制到其他站) ---');
    r.cross.slice(0,10).forEach((p,i)=>l.push('  '+(i+1)+'. '+(p.cs||p.sku)+': ['+Object.keys(p.plats).join(',')+'] $'+p.usd.toFixed(2)));
  }
  
  // Store-Category Matrix
  l.push(''); l.push('--- Store-Category Matrix ---');
  if (r.storeCatMatrix) {
    Object.entries(r.storeCatMatrix).slice(0,8).forEach(function(si) {
      var s=si[0], cats=si[1];
      var catStr=cats.map(function(ci){return (CATEGORY_LABELS[ci[0]]||ci[0])+'($'+ci[1].toFixed(0)+')';}).join(' + ');
      if(catStr)l.push('  '+s.padEnd(22)+': '+catStr);
    });
  }
  // Product Trends
  l.push(''); l.push('--- Product Trends + Development Recommendations ---');
  if (r.productTrends && r.productTrends.length > 0) {
    l.push('Status  | SKU                | Revenue | Prev    | Growth  | Action');
    r.productTrends.slice(0,12).forEach(function(t) {
      var icon={'hot':'HOT ','growing':'UP  ','stable':'STBL','declining':'DOWN','new':'NEW ','unknown':'?   '}[t.status]||'?   ';
      l.push('  '+icon+' | '+(t.cs||t.sku||'').substring(0,18).padEnd(18)+' | $'+t.currentRev.toFixed(0).padStart(6)+' | $'+t.prevRev.toFixed(0).padStart(6)+' | '+String(t.growth).padStart(6)+' | '+t.action);
    });
  }
  // Platform Cost Structure
  if (r.platformCosts && r.platformCosts.length > 0) {
    l.push(''); l.push('--- Platform Cost Structure ---');
    l.push('Platform'.padEnd(20) + 'Revenue'.padEnd(12) + 'Cost'.padEnd(12) + 'Profit'.padEnd(12) + 'Margin'.padEnd(8) + 'Orders');
    for (var pi = 0; pi < r.platformCosts.length; pi++) {
      var pc = r.platformCosts[pi];
      var pct = (pc.margin * 100).toFixed(1) + '%';
      l.push('  ' + pc.label.substring(0,18).padEnd(20) + String.fromCharCode(36) + pc.revenue.toFixed(0).padStart(8) + ' ' + String.fromCharCode(36) + pc.totalCost.toFixed(0).padStart(8) + ' ' + String.fromCharCode(36) + pc.profit.toFixed(0).padStart(8) + ' ' + pct.padStart(6) + ' ' + pc.orders);
    }
  }
  // Decision Suggestions  // Decision Suggestions
  l.push(''); l.push('--- Decision Suggestions ---');
  var t1=r.ranked&&r.ranked[0];if(t1)l.push('  1. Hero: '+(t1.cs||t1.sku)+' ($'+t1.usd.toFixed(2)+', '+(CATEGORY_LABELS[t1.cat]||'')+')');
  var c1=r.cross&&r.cross[0];if(c1)l.push('  2. Cross: '+(c1.cs||c1.sku)+' ('+Object.keys(c1.plats).length+' platforms)');
  var h1=r.hmargin&&r.hmargin[0];if(h1)l.push('  3. High Margin: '+(h1.cs||h1.sku)+' ('+(h1.m*100).toFixed(0)+'% margin)');
  if(r.storeCatMatrix){var mcats=Object.entries(r.storeCatMatrix).sort(function(a,b){return(b[1]&&b[1][0]?b[1][0][1]:0)-(a[1]&&a[1][0]?a[1][0][1]:0);})[0];if(mcats)l.push('  4. Focus: '+(CATEGORY_LABELS[topCat[1][0][0]]||topCat[1][0][0])+' (store:'+topCat[0]+')');}
return l.join('\n');
}
function fmtJson(r){
  return JSON.stringify({
    analyzed_at:new Date().toISOString(),period_days:CONFIG.days,
    total_items:r.total,total_usd_revenue:Math.round(r.usdTotal*100)/100,unique_skus:r.unique,
    store_ranking:r.sRanked.slice(0,20).map(([n,d])=>({name:n,usd_revenue:Math.round(d.usd*100)/100,units:d.q})),
    top_products:r.ranked.slice(0,20).map(p=>({sku:p.sku,client_sku:p.cs,asin:p.asin,title:(p.ti||'').substring(0,80),units:p.q,usd_revenue:Math.round(p.usd*100)/100,cost:p.ct,est_profit:Math.round((p.usd-p.ct*p.q)*100)/100,stores:Object.keys(p.stores).slice(0,5),platforms:Object.keys(p.plats)})),
    cross_platform:r.cross.slice(0,10).map(p=>({sku:p.sku,client_sku:p.cs,usd_revenue:Math.round(p.usd*100)/100,platforms:Object.keys(p.plats)})),
    category_breakdown:Object.entries(r.cSummary).filter(([,v])=>v.skus>0).map(([n,v])=>({category:n,usd_revenue:Math.round(v.usd*100)/100,sku_count:v.skus})),
  },null,2);
}
async function fetchAll(s,e){let a=[];for(const p of PLATFORMS){let nt=0,pg=0,mo=true;while(mo&&pg<20){pg++;const so=buildSoap(CONFIG.customerId,CONFIG.username,CONFIG.password,s,e,p.type,nt);try{const r=await callSoap(CONFIG.host,'/Api/API_Irobotbox_Orders.asmx','http://tempuri.org/GetOrders',so);const pa=parseOrders(r);a=a.concat(pa);const nm=r.match(/<NextToken>(\d+)<\/NextToken>/);mo=r.indexOf('<IsSetOrders>true</IsSetOrders>')>=0&&!!nm;nt=mo?parseInt(nm[1]):null;if(pa.length===0)mo=false;}catch(err){mo=false;}}}return a;}


function fmtHtml(r, prevR, platName) {
  var catSorted = Object.entries(r.cSummary).sort(function(a,b) { return b[1].usd - a[1].usd; });
  var bars = "";
  var maxCat = catSorted.length > 0 ? catSorted[0][1].usd : 1;
  catSorted.forEach(function(ci) {
    var cat = ci[0], info = ci[1];
    var lb = (CATEGORY_LABELS[cat] || cat);
    var pct = (info.usd / r.usdTotal * 100).toFixed(1);
    var barW = (info.usd / maxCat * 100).toFixed(0);
    var trend = "";
    if (prevR && prevR.cSummary && prevR.cSummary[cat]) {
      var chg = ((info.usd - prevR.cSummary[cat].usd) / prevR.cSummary[cat].usd * 100).toFixed(0);
      var cls = chg > 0 ? "up" : (chg < 0 ? "down" : "flat");
      trend = "<span class=\"" + cls + "\">" + (chg > 0 ? "+" : "") + chg + "%</span>";
    }
    bars += "<tr><td class=\"cat\">" + lb + "</td><td class=\"rev\">$" + info.usd.toFixed(0) + "</td><td class=\"pct\">" + pct + "%</td><td class=\"bar\"><div class=\"bar-fill\" style=\"width:" + barW + "%\"></div></td><td class=\"skus\">" + info.skus + "</td><td class=\"trend\">" + trend + "</td></tr>";
  });
  var storeRows = "";
  r.sRanked.slice(0,20).forEach(function(si) {
    var s = si[0], d = si[1];
    var trend = "";
    if (prevR) {
      var ps = prevR.sRanked.find(function(x) { return x[0] === s; });
      if (ps) {
        var chg = ((d.usd - ps[1].usd) / ps[1].usd * 100).toFixed(1);
        var cls = chg > 0 ? "up" : (chg < 0 ? "down" : "flat");
        trend = "<span class=\"" + cls + "\">" + (chg > 0 ? "+" : "") + chg + "%</span>";
      } else { trend = "<span class=\"new\">NEW</span>"; }
    }
    storeRows += "<tr><td>" + s + "</td><td class=\"rev\">$" + d.usd.toFixed(2) + "</td><td>" + d.q + "</td><td class=\"trend\">" + trend + "</td></tr>";
  });
  var prodRows = "";
  r.ranked.slice(0,15).forEach(function(p) {
    var ti = (p.ti || p.cs || p.sku).substring(0, 50);
    var ss = Object.keys(p.stores).slice(0,3).join(", ");
    var cs = p.cat ? CATEGORY_LABELS[p.cat] || p.cat : "";
    prodRows += "<tr><td>" + (p.cs || p.sku) + "</td><td>" + (p.asin || "-") + "</td><td>" + ti + "</td><td>" + p.q + "</td><td class=\"rev\">$" + p.usd.toFixed(2) + "</td><td>" + cs + "</td></tr>";
  });
  var crossRows = "";
  if (r.cross && r.cross.length > 0) {
    r.cross.slice(0,10).forEach(function(p) {
      crossRows += "<tr><td>" + (p.cs || p.sku) + "</td><td>" + Object.keys(p.plats).join(", ") + "</td><td class=\"rev\">$" + p.usd.toFixed(2) + "</td></tr>";
    });
  }
  var html = "<!DOCTYPE html><html lang=\"zh\"><head><meta charset=\"UTF-8\"><title>\u8D5B\u76D2ERP - \u8BA2\u5355\u5206\u6790</title><style>";
  html += "*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;padding:40px;background:#f5f6fa;color:#2d3436}";
  html += "h1{font-size:24px;margin-bottom:8px}h2{font-size:18px;margin:32px 0 16px;color:#636e72}";
  html += ".summary{display:flex;gap:24px;margin:16px 0 32px}.stat{background:#fff;padding:20px 28px;border-radius:8px;flex:1;box-shadow:0 1px 3px rgba(0,0,0,.1)}";
  html += ".stat .num{font-size:28px;font-weight:700;color:#0984e3}.stat .lbl{font-size:13px;color:#636e72;margin-top:4px}";
  html += "table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}";
  html += "th{background:#0984e3;color:#fff;padding:12px 16px;text-align:left;font-weight:600;font-size:13px}";
  html += "td{padding:10px 16px;border-bottom:1px solid #dfe6e9;font-size:13px}tr:hover{background:#f8f9fa}";
  html += ".bar{width:200px}.bar-fill{height:20px;background:#0984e3;border-radius:4px;min-width:4px}";
  html += ".rev{text-align:right;font-family:monospace}.skus,.pct{text-align:center}.cat{font-weight:600}";
  html += ".up{color:#00b894;font-weight:600}.down{color:#d63031;font-weight:600}.flat{color:#636e72}.new{color:#0984e3;font-weight:600}";
  html += ".trend{text-align:center;font-weight:600;font-size:13px}";
  html += ".footer{margin-top:32px;padding:16px;background:#dfe6e9;border-radius:8px;color:#636e72;font-size:12px;text-align:center}";
  html += "</style></head><body>";
  html += "<h1>\u8D5B\u76D2ERP \u8BA2\u5355\u6570\u636E\u5206\u6790</h1>";
  html += "<p>" + platName + " | " + CONFIG.days + "\u5929 | " + r.total + "\u6761\u8BA2\u5355</p>";
  if (prevR) {
    var chg = ((r.usdTotal - prevR.usdTotal) / prevR.usdTotal * 100).toFixed(1);
    html += "<p style=\"color:" + (chg > 0 ? "#00b894" : "#d63031") + "\">\u73AF\u6BD4: " + (chg > 0 ? "+" : "") + chg + "% ($" + prevR.usdTotal.toFixed(0) + " \u2192 $" + r.usdTotal.toFixed(0) + ")</p>";
  }
  html += "<div class=\"summary\"><div class=\"stat\"><div class=\"num\">$" + r.usdTotal.toFixed(0) + "</div><div class=\"lbl\">\u603B\u8425\u6536</div></div>";
  html += "<div class=\"stat\"><div class=\"num\">" + r.total + "</div><div class=\"lbl\">\u8BA2\u5355\u6761\u6570</div></div>";
  html += "<div class=\"stat\"><div class=\"num\">" + r.unique + "</div><div class=\"lbl\">\u552E\u4E00SKU</div></div></div>";
  html += "<h2>\u7C7B\u76EE\u5206\u6790</h2><table><tr><th>\u7C7B\u76EE</th><th>\u8425\u6536</th><th>\u5360\u6BD4</th><th>\u56FE\u793A</th><th>SKU</th><th>\u8D8B\u52BF</th></tr>" + bars + "</table>";
  if (prevR) {
    html += "<p style=\"margin-top:8px;font-size:12px;color:#636e72\">\u7EFF\u8272 = \u589E\u957F\uff0c\u7EA2\u8272 = \u4E0B\u964D\uff0c\u7070\u8272 = \u5E73\u7A33</p>";
  }
  html += "<h2>\u5E97\u94FA\u6392\u540D</h2><table><tr><th>\u5E97\u94FA</th><th>\u8425\u6536</th><th>\u4EF6\u6570</th><th>\u8D8B\u52BF</th></tr>" + storeRows + "</table>";
  html += "<h2>TOP 15 \u9AD8\u6F5C\u4EA7\u54C1</h2><table><tr><th>SKU</th><th>ASIN</th><th>\u6807\u9898</th><th>\u9500\u91CF</th><th>\u8425\u6536</th><th>\u7C7B\u76EE</th></tr>" + prodRows + "</table>";
  if (crossRows) {
    html += "<h2>\u8DE8\u5E73\u53F0SKU</h2><table><tr><th>SKU</th><th>\u5E73\u53F0</th><th>\u8425\u6536</th></tr>" + crossRows + "</table>";
  if (r.platformCosts && r.platformCosts.length > 0) {
    var platCostRows = "";
    for (var pi = 0; pi < r.platformCosts.length; pi++) {
      var pc = r.platformCosts[pi];
      var marginColor = pc.margin > 0.2 ? '#00b894' : (pc.margin > 0 ? '#fdcb6e' : '#d63031');
      platCostRows += '<tr><td>' + pc.label + '</td><td class="rev">' + String.fromCharCode(36) + pc.revenue.toFixed(0) + '</td><td class="rev">' + String.fromCharCode(36) + pc.totalCost.toFixed(0) + '</td><td class="rev" style="color:' + marginColor + '">' + String.fromCharCode(36) + pc.profit.toFixed(0) + '</td><td class="rev" style="color:' + marginColor + '">' + (pc.margin*100).toFixed(1) + '%</td><td>' + pc.orders + '</td></tr>';
    }
    html += '<h2>\u5E73\u53F0\u6210\u672C\u7ED3\u6784</h2><table><tr><th>\u5E73\u53F0</th><th>\u8425\u6536</th><th>\u6210\u672C</th><th>\u5229\u6DA6</th><th>\u5229\u6DA6\u7387</th><th>\u8BA2\u5355</th></tr>' + platCostRows + '</table>';
  }

  }
  html += "<div class=\"footer\">\u751F\u6210\u65F6\u95F4: " + new Date().toLocaleString() + " | Saihe ERP Order Analyzer v2</div>";
  html += "</body></html>";
  return html;
}



function computeTrends(currRanked, prevRanked) {
  var prevMap={};if(prevRanked)prevRanked.forEach(function(p){prevMap[p.sku]=p;});
  var trends=[];
  currRanked.forEach(function(p){
    var pp=prevMap[p.sku];
    var prevRev=pp?pp.usd:0;
    var growth=prevRev>0?((p.usd-prevRev)/prevRev*100).toFixed(0):(p.usd>0?"NEW":"-");
    var status,action;
    if(growth==="NEW"){status="new";action="新品上架，建议先观察2周再决定是否加投";}
    else if(growth>50){status="hot";action="爆款！建议扩展到未覆盖站点，增加广告投入";}
    else if(growth>15){status="growing";action="增长良好，建议优化Listing，增加捆绑新组合";}
    else if(growth>-15){status="stable";action="稳定销售，建议维持现有组合，少量优化关键词";}
    else if(prevRev>0){status="declining";action="下滑中，建议检查竞品价格，考虑促销或加微信售后";}
    else{status="unknown";action="待观察";}
    if(p.usd>50||(pp&&pp.usd>50))trends.push({sku:p.sku,cs:p.cs,cat:p.cat,title:(p.ti||"").substring(0,40),currentRev:p.usd,prevRev:prevRev,growth:growth,status:status,action:action});
  });
  trends.sort(function(a,b){var ag=typeof a.growth==="number"?a.growth:-9999;var bg=typeof b.growth==="number"?b.growth:-9999;return bg-ag;});
  return trends;
}

function computePlatformCosts(orders) {
  if (!orders || orders.length === 0) return [];
  var platData = {};
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var fType = cm.detectFulfillmentType(o);
    if (!platData[fType]) platData[fType] = { orders: 0, revenue: 0, totalCost: 0, profit: 0 };
    var rev = cm.toUsd(o.price * o.qty, o.currency);
    var analysis = cm.buildCostAnalysis(o, fType);
    if (analysis.error) continue;
    platData[fType].orders += o.qty;
    platData[fType].revenue += rev;
    platData[fType].totalCost += analysis.totalCost;
    platData[fType].profit += analysis.unitProfit * o.qty;
    platData[fType].margin = platData[fType].revenue > 0 ? platData[fType].profit / platData[fType].revenue : 0;
  }
  var result = [];
  for (var key in platData) {
    var d = platData[key];
    var label = (cm.PLATFORM_COST_MODELS[key] || {}).label || key;
    result.push({ key: key, label: label, orders: d.orders, revenue: Math.round(d.revenue * 100) / 100, totalCost: Math.round(d.totalCost * 100) / 100, profit: Math.round(d.profit * 100) / 100, margin: d.margin });
  }
  result.sort(function(a,b) { return b.revenue - a.revenue; });
  return result;
}

async function main(){if(!CONFIG.username||!CONFIG.password){process.stderr.write('Missing credentials.\n');process.exit(1);}const now=new Date(),days=CONFIG.days;const st=new Date(Date.now()-days*86400000);const stPrev=new Date(Date.now()-2*days*86400000);function fd(d){var m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'),h=String(d.getHours()).padStart(2,'0'),mi=String(d.getMinutes()).padStart(2,'0'),s=String(d.getSeconds()).padStart(2,'0');return d.getFullYear()+'-'+m+'-'+dd+' '+h+':'+mi+':'+s;}process.stderr.write('Fetching current: '+fd(st)+' -> '+fd(now)+'\n');var curr=await fetchAll(fd(st),fd(now));process.stderr.write(curr.length+' orders.\n');process.stderr.write('Fetching previous: '+fd(stPrev)+' -> '+fd(st)+'\n');var prev=await fetchAll(fd(stPrev),fd(st));process.stderr.write(prev.length+' orders.\n');var r=analyze(curr),rp=prev.length>0?analyze(prev):null;var pt=rp?computeTrends(r.ranked,rp.ranked):[];var pc=computePlatformCosts(curr);r.platformCosts=pc;r.productTrends=pt;var fmap={json:fmtJson,html:fmtHtml};console.log(fmap[CONFIG.format]?fmap[CONFIG.format](r,rp,PLATFORMS.map(p=>p.name).join(', ')):fmtReport(r,rp,PLATFORMS.map(p=>p.name).join(', ')));}

main().catch(function(e){process.stderr.write('Error: '+e.message+'\n');process.exit(1);});
