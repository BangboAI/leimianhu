#!/usr/bin/env node
/**
 * Saihe ERP Settlement Profit Analyzer
 */
const https = require("https");
const fs = require("fs");
const a = process.argv.slice(2);
function g(f,e,d){const i=a.indexOf(f);return i>=0?a[i+1]:process.env[e]||d}
const C={
  host:g("--host","SAIHE_HOST","gg16.irobotbox.com"),
  cid:g("--cid","SAIHE_CUSTOMER_ID","1502"),
  user:g("--user","SAIHE_USERNAME",""),
  pass:g("--pass","SAIHE_PASSWORD",""),
  days:parseInt(g("--days","SAIHE_DAYS","365")),
  fmt:g("--format","SAIHE_FORMAT","text"),
};
const PLATFORMS=[{t:1,n:"Amazon"},{t:45,n:"Walmart"},{t:104,n:"TikTok"},{t:57,n:"Etsy"},{t:122,n:"OZON"},{t:50,n:"Shopify"}];
const FX={USD:1,EUR:0.91,JPY:150,GBP:0.79,CAD:1.37,MXN:20,AUD:1.5};
function _e(x,t){var m=x.match(new RegExp("<"+t+">([^<]*)</"+t+">"));return m?m[1].trim():""}
function u(a,c){return a/(FX[c]||1)}
function gp(n){var s=n||"";if(/amazon/i.test(s))return"Amazon";if(/walmart/i.test(s))return"Walmart";if(/tiktok|TK$/i.test(s))return"TikTok";if(/etsy/i.test(s))return"Etsy";if(/ozon/i.test(s))return"OZON";if(/shopify/i.test(s))return"Shopify";return"Other"}
async function fetchSettlements(h,c,u,p,st,et,t){
  var body="<?xml version=\"1.0\" encoding=\"utf-8\"?><soap:Envelope xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\" xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><GetOrderSettlementReport xmlns=\"http://tempuri.org/\"><request><CustomerID>"+c+"</CustomerID><UserName>"+u+"</UserName><Password>"+p+"</Password><OrderSourceType>"+t+"</OrderSourceType><UpdateTimeBegin>"+st+"</UpdateTimeBegin><UpdateTimeEnd>"+et+"</UpdateTimeEnd><PageIndex>1</PageIndex><PageSize>200</PageSize></request></GetOrderSettlementReport></soap:Body></soap:Envelope>";
  return new Promise(function(s,j){
    var r=https.request({hostname:h,path:"/Api/API_Irobotbox_Orders.asmx",method:"POST",rejectUnauthorized:false,headers:{"Content-Type":"text/xml; charset=utf-8","SOAPAction":"http://tempuri.org/GetOrderSettlementReport","Content-Length":Buffer.byteLength(body)}},function(e){var d="";e.on("data",function(c){d+=c});e.on("end",function(){
      if(_e(d,"Status")!=="OK"){s([]);return}
      var recs=d.split("<OrderSettlement>");var out=[];
      for(var i=1;i<recs.length;i++){
        var x=recs[i].split("</OrderSettlement>")[0];if(!x)continue;
        var o={sku:_e(x,"ClientSKU"),store:_e(x,"OrderSourceName"),type:_e(x,"SettlementType"),cur:_e(x,"Currency"),product:_e(x,"ProductNameCN"),sp:parseFloat(_e(x,"SalesPrice"))||0,buy:parseFloat(_e(x,"BuyPrice"))||0,first:parseFloat(_e(x,"FirstLegFees"))||0,tariff:parseFloat(_e(x,"TariffFees"))||0,comm:parseFloat(_e(x,"CommisionFee"))||0,fba:parseFloat(_e(x,"FBATransactionFees"))||0,ad:parseFloat(_e(x,"CostOfAdvertising"))||0,pkg:parseFloat(_e(x,"PackageFees"))||0,wh:parseFloat(_e(x,"WareHouseManagementPrice"))||0,ref:parseFloat(_e(x,"SalesRefunds"))||0,exch:parseFloat(_e(x,"ExchangeLost"))||0,other:parseFloat(_e(x,"CustomFeeOtherCostPrice"))||0,od:parseFloat(_e(x,"OrderSourceOtherDebits"))||0,exp:parseFloat(_e(x,"Expenses"))||0,prof:parseFloat(_e(x,"Profits"))||0};
        out.push(o);
      }
      s(out);
    })});r.on("error",j);r.write(body);r.end();
  });
}
async function main(){
  if(!C.user||!C.pass){process.stderr.write("Missing credentials.\n");process.exit(1)}
  var now=new Date();var st=new Date(now.getTime()-C.days*86400000);
  function fd(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+"T00:00:00"}
  var sts=fd(st);var ets=fd(now);var all=[];
  for(var p=0;p<PLATFORMS.length;p++){
    var plat=PLATFORMS[p];
    process.stderr.write("Fetching "+plat.n+"...\n");
    var recs=await fetchSettlements(C.host,C.cid,C.user,C.pass,sts,ets,plat.t);
    process.stderr.write("  Got "+recs.length+" records\n");
    all=all.concat(recs);
  }
  process.stderr.write("Total: "+all.length+" records\n");
  if(all.length===0){console.log("No settlement data.");return}
  
  // Aggregate by SKU
  var bySku={};var _platBrk={};
  for(var i=0;i<all.length;i++){
    var o=all[i];
    if(!o.sku)continue;
    if(o.prof<-1000||o.prof>50000)continue;
    if(!bySku[o.sku]){
      bySku[o.sku]={sku:o.sku,product:o.product,revenue:0,buy:0,first:0,tariff:0,comm:0,fba:0,ad:0,pkg:0,wh:0,ref:0,exch:0,other:0,od:0,exp:0,profit:0,orders:0};
    }
    var d=bySku[o.sku];var rev=u(o.sp,o.cur);
    d.revenue+=rev;d.buy+=u(o.buy,o.cur);d.first+=u(o.first,o.cur);d.tariff+=u(o.tariff,o.cur);
    d.comm+=u(o.comm,o.cur);d.fba+=u(o.fba,o.cur);d.ad+=u(o.ad,o.cur);d.pkg+=u(o.pkg,o.cur);
    d.wh+=u(o.wh,o.cur);d.ref+=u(o.ref,o.cur);d.exch+=u(o.exch,o.cur);d.other+=u(o.other,o.cur);
    d.od+=u(o.od,o.cur);d.exp+=u(-o.exp,o.cur);d.profit+=u(o.prof,o.cur);d.orders++;
    // Platform breakdown
    var pn=gp(o.store);if(!_platBrk[pn])_platBrk[pn]={revenue:0,profit:0,orders:0};
    _platBrk[pn].revenue+=rev;_platBrk[pn].profit+=u(o.prof,o.cur);_platBrk[pn].orders++;
  }
  var skuList=Object.values(bySku).sort(function(a,b){return b.profit-a.profit}).filter(function(s){return s.revenue>0});
  var best=skuList.filter(function(s){return s.profit>0}).slice(0,10);
  var lose=skuList.filter(function(s){return s.profit<0}).sort(function(a,b){return a.profit-b.profit}).slice(0,5);
  var tr=skuList.reduce(function(s,x){return s+x.revenue},0);
  var tp=skuList.reduce(function(s,x){return s+x.profit},0);
  var tc=skuList.reduce(function(s,x){return s+x.exp},0);
  
  // Report
  var l=[];
  l.push("");
  l.push("================================");
  l.push("  ??ERP ??????");
  l.push("  ??: ??"+C.days+"?");
  l.push("  ????: "+(new Date()).toISOString().substring(0,19));
  l.push("================================");
  l.push("");
  l.push("???: $"+tr.toFixed(2));
  l.push("???: $"+tc.toFixed(2));
  l.push("???: $"+tp.toFixed(2));
  l.push("????: "+(tr>0?(tp/tr*100).toFixed(1):"-")+"%");
  l.push("??SKU: "+skuList.filter(function(s){return s.profit>0}).length+" | ??SKU: "+lose.length);
  l.push("");
  l.push("--- ?????? ---");
  l.push("??".padEnd(14)+"??".padEnd(10)+"??".padEnd(10)+"???".padEnd(8)+"??");
  var platSorted=Object.entries(_platBrk).sort(function(a,b){return b[1].profit-a[1].profit});
  for(var pi=0;pi<platSorted.length;pi++){
    var pn=platSorted[pi][0];var pd=platSorted[pi][1];
    var pm=pd.revenue>0?(pd.profit/pd.revenue*100).toFixed(1)+"%":"-";
    l.push("  "+pn.padEnd(12)+"$"+pd.revenue.toFixed(0).padStart(6)+" $"+pd.profit.toFixed(0).padStart(6)+" "+pm.padStart(6)+" "+pd.orders);
  }
  l.push("");
  // Top profitable
  l.push("--- TOP 10 ???SKU ---");
  l.push("SKU".padEnd(15)+"??".padEnd(10)+"??".padEnd(8)+"??".padEnd(8)+"??".padEnd(8)+"??".padEnd(10)+"??".padEnd(10)+"???");
  for(var bi=0;bi<best.length;bi++){
    var s=best[bi];var mr=s.revenue>0?(s.profit/s.revenue*100).toFixed(1)+"%":"-";
    l.push("  "+(s.sku||"").substring(0,10).padEnd(15)+"$"+s.revenue.toFixed(0).padStart(6)+" "+s.buy.toFixed(0).padStart(6)+" "+s.first.toFixed(0).padStart(6)+" "+s.comm.toFixed(0).padStart(6)+" "+(s.pkg||0).toFixed(0).padStart(6)+" $"+s.profit.toFixed(0).padStart(6)+" "+mr.padStart(6));
  }
  l.push("");
  // Losing
  if(lose.length>0){
    l.push("--- ??SKU (?????) ---");
    for(var li=0;li<lose.length;li++){
      var ls=lose[li];
      l.push("  "+(ls.sku||"").substring(0,12).padEnd(14)+(ls.product||"").substring(0,22).padEnd(24)+"??: $"+Math.abs(ls.profit).toFixed(2)+" | ??: $"+ls.revenue.toFixed(2));
    }
    l.push("");
  }
  
  // Cost calibration (from profitable SKUs with buy data)
  var costSamples=Object.values(bySku).filter(function(s){return s.revenue>10&&s.buy<0});
  if(costSamples.length>0){
    var avgBuy=costSamples.reduce(function(s,x){return s+Math.abs(x.buy)},0)/costSamples.length;
    var avgFirst=costSamples.reduce(function(s,x){return s+Math.abs(x.first)},0)/costSamples.length;
    var avgComm=costSamples.reduce(function(s,x){return s+Math.abs(x.comm)},0)/costSamples.length;
    var avgFba=costSamples.reduce(function(s,x){return s+Math.abs(x.fba)},0)/costSamples.length;
    var avgAd=costSamples.reduce(function(s,x){return s+Math.abs(x.ad)},0)/costSamples.length;
    var avgPkg=costSamples.reduce(function(s,x){return s+Math.abs(x.pkg)},0)/costSamples.length;
    var avgRev=costSamples.reduce(function(s,x){return s+x.revenue},0)/costSamples.length;
    l.push("--- ???????? (??"+costSamples.length+"?SKU?????) ---");
    if(avgBuy)l.push("  ??????: $"+(avgBuy/1).toFixed(2)+" | "+(avgBuy/avgRev*100).toFixed(1)+"%");
    if(avgFirst)l.push("  ??????: $"+(avgFirst/1).toFixed(2)+" | "+(avgFirst/avgRev*100).toFixed(1)+"%");
    if(avgComm)l.push("  ??????: $"+(avgComm/1).toFixed(2)+" | "+(avgComm/avgRev*100).toFixed(1)+"%");
    if(avgFba)l.push("  FBA/WFS????: $"+(avgFba/1).toFixed(2)+" | "+(avgFba/avgRev*100).toFixed(1)+"%");
    if(avgAd)l.push("  ?????: $"+(avgAd/1).toFixed(2)+" | "+(avgAd/avgRev*100).toFixed(1)+"%");
    if(avgPkg)l.push("  ??????: $"+(avgPkg/1).toFixed(2)+" | "+(avgPkg/avgRev*100).toFixed(1)+"%");
    l.push("");
  }
  
  console.log(l.join("\n"));
  
  // Save data
  try{var dataDir=__dirname+"/../data";if(!fs.existsSync(dataDir))fs.mkdirSync(dataDir);var d2={generated:new Date().toISOString(),total_sku:skuList.length,total_revenue:Math.round(tr*100)/100,total_profit:Math.round(tp*100)/100,margin:tr>0?Math.round(tp/tr*10000)/100:0};fs.writeFileSync(dataDir+"/settlement-profit.json",JSON.stringify(d2,null,2),"utf8");process.stderr.write("\n?????? data/settlement-profit.json\n")}catch(e){}
}
main().catch(function(e){process.stderr.write("Error: "+e.message+"\n");process.exit(1)});