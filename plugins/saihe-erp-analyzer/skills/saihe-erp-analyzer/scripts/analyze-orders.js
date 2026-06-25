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
const args = process.argv.slice(2);
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
    const store = extract(b, 'OrderSourceName');
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
  const bySku={}, byStore={}, byCat={light:{},bag:{},accessory:{},electronic:{},other:{}};
  for (const o of orders) {
    const rev = o.price * o.qty;
    const usd = toUsd(rev, o.currency);
    if (!bySku[o.sku]) bySku[o.sku]={sku:o.sku,cs:o.clientSku,asin:o.asin,ti:o.title,ct:o.cost,stores:{},plats:{},q:0,rev:0,usd:0,oc:0};
    const p=bySku[o.sku]; p.q+=o.qty; p.rev+=rev; p.usd+=usd; p.oc++;
    p.stores[o.store]=(p.stores[o.store]||0)+o.qty;
    p.plats[o.store.replace(/\(.*\)/,'').trim()]=1;
    if(!p.ti&&o.title)p.ti=o.title; if(!p.asin&&o.asin)p.asin=o.asin; if(o.cost>0)p.ct=o.cost;
    if(!byStore[o.store])byStore[o.store]={usd:0,q:0,oc:0};
    const s=byStore[o.store]; s.usd+=usd; s.q+=o.qty; s.oc++;
    const cat=classifyProduct(o.title,o.clientSku);
    if(!byCat[cat][o.sku])byCat[cat][o.sku]={sku:o.sku,cs:o.clientSku,asin:o.asin,ti:o.title,ct:o.cost,q:0,usd:0,stores:{},plats:{}};
    const cp=byCat[cat][o.sku]; cp.q+=o.qty; cp.usd+=usd; cp.stores[o.store]=(cp.stores[o.store]||0)+o.qty;
    cp.plats[o.store.replace(/\(.*\)/,'').trim()]=1;
    if(!cp.ti&&o.title)cp.ti=o.title; if(o.cost>0)cp.ct=o.cost;
  }
  const ranked=Object.values(bySku).sort((a,b)=>b.usd-a.usd);
  const sRanked=Object.entries(byStore).sort((a,b)=>b[1].usd-a[1].usd);
  const cSummary={};
  for(const[cat,items]of Object.entries(byCat)){
    const arr=Object.values(items);
    cSummary[cat]={totalUsd:arr.reduce((s,p)=>s+p.usd,0),skuCount:arr.length};
  }
  const cross=Object.values(bySku).filter(p=>Object.keys(p.plats).length>1).sort((a,b)=>b.usd-a.usd);
  const margin=Object.values(bySku).filter(p=>p.ct>0&&p.q>0).map(p=>({...p,m:(p.usd-p.ct*p.q)/p.usd})).filter(p=>p.m>0.6).sort((a,b)=>b.usd-a.usd);
  return {total:orders.length,usdTotal:orders.reduce((s,o)=>s+toUsd(o.price*o.qty,o.currency),0),unique:Object.keys(bySku).length,ranked,sRanked,cSummary,cross:cross.slice(0,15),hmargin:margin.slice(0,15)};
}
function fmtReport(r, platName) {
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
  r.sRanked.slice(0,15).forEach(([s,d],i)=>l.push('  '+(i+1)+'. '+s+': $'+d.usd.toFixed(2)+' ('+d.q+'件)'));
  l.push(''); l.push('--- 品类营收(USD) ---');
  for(const[cat,info]of Object.entries(r.cSummary))if(info.skuCount>0)l.push('  '+cat+': $'+info.totalUsd.toFixed(2)+' ('+info.skuCount+' SKUs)');
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
  return l.join('\n');
}
function fmtJson(r){
  return JSON.stringify({
    analyzed_at:new Date().toISOString(),period_days:CONFIG.days,
    total_items:r.total,total_usd_revenue:Math.round(r.usdTotal*100)/100,unique_skus:r.unique,
    store_ranking:r.sRanked.slice(0,20).map(([n,d])=>({name:n,usd_revenue:Math.round(d.usd*100)/100,units:d.q})),
    top_products:r.ranked.slice(0,20).map(p=>({sku:p.sku,client_sku:p.cs,asin:p.asin,title:(p.ti||'').substring(0,80),units:p.q,usd_revenue:Math.round(p.usd*100)/100,cost:p.ct,est_profit:Math.round((p.usd-p.ct*p.q)*100)/100,stores:Object.keys(p.stores).slice(0,5),platforms:Object.keys(p.plats)})),
    cross_platform:r.cross.slice(0,10).map(p=>({sku:p.sku,client_sku:p.cs,usd_revenue:Math.round(p.usd*100)/100,platforms:Object.keys(p.plats)})),
    category_breakdown:Object.entries(r.cSummary).filter(([,v])=>v.skuCount>0).map(([n,v])=>({category:n,usd_revenue:Math.round(v.totalUsd*100)/100,sku_count:v.skuCount})),
  },null,2);
}
async function main(){
  if(!CONFIG.username||!CONFIG.password){console.error('Missing credentials. Use --user/--pass or env SAIHE_USERNAME/SAIHE_PASSWORD');process.exit(1);}
  const now=new Date();
  const st=new Date(Date.now()-CONFIG.days*24*60*60*1000);
  function fd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');}
  const start=fd(st),end=fd(now);
  let all=[]; const h=CONFIG.host;
  for(const plat of PLATFORMS){
    let nt=0,pg=0,more=true; let po=[];
    while(more&&pg<20){pg++;
      const soap=buildSoap(CONFIG.customerId,CONFIG.username,CONFIG.password,start,end,plat.type,nt);
      try{const raw=await callSoap(h,'/Api/API_Irobotbox_Orders.asmx','http://tempuri.org/GetOrders',soap);
        const pa=parseOrders(raw); po=po.concat(pa);
        const nm=raw.match(/<NextToken>(\d*)<\/NextToken>/);
        more=raw.indexOf('<IsSetOrders>true</IsSetOrders>')>=0&&!!nm; nt=more?parseInt(nm[1]):null;
        if(pa.length===0)more=false;
      }catch(e){more=false;}
    } all=all.concat(po);
  }
  const r=analyze(all);
  if(CONFIG.format==='json'){console.log(fmtJson(r));}
  else{console.log(fmtReport(r,PLATFORMS.map(p=>p.name).join(', ')));console.log('');
    console.log('--- 高毛利产品(>60%) ---');
    r.hmargin.slice(0,10).forEach((p,i)=>{const margin=(p.m*100).toFixed(0);const profit=p.usd-p.ct*p.q;const ti=(p.ti||p.cs||p.sku).substring(0,40);console.log('  '+(i+1)+'. '+ti+' | $'+p.usd.toFixed(2)+' | 毛利'+margin+'% | 利润$'+profit.toFixed(2));});
    console.log('');console.log('--- 决策建议 ---');
    const topSku=r.ranked[0]; if(topSku)console.log('  1. 旗舰款: '+(topSku.cs||topSku.sku)+' ($'+topSku.usd.toFixed(2)+') - 推广到所有未覆盖站点');
    const crossTop=r.cross[0]; if(crossTop)console.log('  2. 跨站复制: '+(crossTop.cs||crossTop.sku)+' 已在'+Object.keys(crossTop.plats).length+'个站点 - 可推新站');
    const hmTop=r.hmargin[0]; if(hmTop)console.log('  3. 高毛利爆款: '+(hmTop.cs||hmTop.sku)+' (毛利率'+(hmTop.m*100).toFixed(0)+'%) - 优化Listing扩大流量');
  }
}
main().catch(e=>{console.error('Fatal:',e.message);process.exit(1);});
