#!/usr/bin/env node
/**
 * 赛盒ERP 平台成本结构模型 v2
 * 
 * 定义各平台+物流方式的成本组件与默认比例
 * 数据来源: 
 *   1. GetOrders API 返回的 LastBuyPrice/FirstLegFee/TariffFee
 *   2. GetProcurementBySKU API 返回的 ActualPrice (纯采购价)
 *   3. 各平台官方费率表 (默认估算)
 *   4. 用户实际校准 (config)
 * 
 * 仓库映射:
 *   FBA  = Amazon Fulfillment (平台配送)
 *   WFS  = Walmart Fulfillment Services
 *   FBT  = TikTok Fulfilled by TikTok
 *   FULL = 美客多 MercadoLibre Full
 *   FBO  = OZON Fulfillment by Ozon
 *   谷仓  = GoodCang 谷仓海外仓
 *   深圳仓 = 深圳直发 (小包快递)
 */

// ============ 1. 平台+物流 枚举 ============
const FULFILLMENT_TYPES = {
  AMAZON_FBA:   { key: 'amazon_fba',   plat: 'Amazon',   ftype: 'FBA',  label: 'Amazon FBA' },
  AMAZON_FBM:   { key: 'amazon_fbm',   plat: 'Amazon',   ftype: 'FBM',  label: 'Amazon FBM (自发货)' },
  WALMART_WFS:  { key: 'walmart_wfs',  plat: 'Walmart',  ftype: 'WFS',  label: 'Walmart WFS' },
  WALMART_FBM:  { key: 'walmart_fbm',  plat: 'Walmart',  ftype: 'FBM',  label: 'Walmart 自发货' },
  TIKTOK_FBT:   { key: 'tiktok_fbt',   plat: 'TikTok',   ftype: 'FBT',  label: 'TikTok FBT' },
  TIKTOK_FBM:   { key: 'tiktok_fbm',   plat: 'TikTok',   ftype: 'FBM',  label: 'TikTok 自发货' },
  MERCADO_FULL: { key: 'mercado_full', plat: 'Mercado',  ftype: 'FULL', label: '美客多 Full' },
  MERCADO_FBM:  { key: 'mercado_fbm',  plat: 'Mercado',  ftype: 'FBM',  label: '美客多 自发货' },
  OZON_FBO:     { key: 'ozon_fbo',     plat: 'OZON',     ftype: 'FBO',  label: 'OZON FBO' },
  OZON_FBS:     { key: 'ozon_fbs',     plat: 'OZON',     ftype: 'FBS',  label: 'OZON FBS (自发货)' },
  ETSY_FBM:     { key: 'etsy_fbm',     plat: 'Etsy',     ftype: 'FBM',  label: 'Etsy 自发货' },
  SHOPIFY_FBM:  { key: 'shopify_fbm',  plat: 'Shopify',  ftype: 'FBM',  label: 'Shopify 自发货' },
  GUCANG:       { key: 'gucang',       plat: '多平台',    ftype: '谷仓',  label: '谷仓海外仓' },
  SHENZHEN:     { key: 'shenzhen',     plat: '多平台',     ftype: '深圳',  label: '深圳仓直发' },
};

// ============ 2. 成本组件定义 ============
const COMPONENT_DEFS = {
  product_cost: { name: 'product_cost', label: '采购成本',          order: 1 },
  first_leg:    { name: 'first_leg',    label: '头程物流费',       order: 2 },
  tariff:       { name: 'tariff',       label: '关税',             order: 3 },
  fulfillment:  { name: 'fulfillment',  label: '尾程配送费',       order: 4 },
  commission:   { name: 'commission',   label: '平台佣金',         order: 5 },
  advertising:  { name: 'advertising',  label: '广告费',           order: 6 },
  storage:      { name: 'storage',      label: '仓储费',           order: 7 },
  return_cost:  { name: 'return_cost',  label: '退货退款损失',     order: 8 },
  other:        { name: 'other',        label: '其他费用',         order: 9 },
};

// ============ 3. 各平台+物流 默认成本比例 ============
const PLATFORM_COST_MODELS = {
  amazon_fba: {
    label: 'Amazon FBA',
    total_est_pct: 0.77,
    profit_est_pct: 0.23,
    components: {
      product_cost: { pct: 0.20, source: 'api',    note: 'LastBuyPrice 或 GetProcurementBySKU' },
      first_leg:    { pct: 0.06, source: 'api',    note: 'FirstLegFee 字段; 默认6%' },
      tariff:       { pct: 0.03, source: 'api',    note: 'TariffFee 字段; 默认3%' },
      fulfillment:  { pct: 0.18, source: 'estimate', note: 'FBA配送费; 按尺寸重量浮动' },
      commission:   { pct: 0.15, source: 'estimate', note: '亚马逊平台佣金 15%' },
      advertising:  { pct: 0.10, source: 'estimate', note: '站内PPC广告费' },
      storage:      { pct: 0.03, source: 'estimate', note: '月度仓储费分摊' },
      return_cost:  { pct: 0.02, source: 'estimate', note: '退货处理及退款损失' },
    }
  },
  walmart_wfs: {
    label: 'Walmart WFS',
    total_est_pct: 0.68,
    profit_est_pct: 0.32,
    components: {
      product_cost: { pct: 0.20, source: 'api' },
      first_leg:    { pct: 0.06, source: 'api' },
      tariff:       { pct: 0.03, source: 'api' },
      fulfillment:  { pct: 0.15, source: 'estimate', note: 'WFS配送费' },
      commission:   { pct: 0.12, source: 'estimate', note: 'Walmart佣金 8-15%' },
      advertising:  { pct: 0.08, source: 'estimate', note: 'Walmart广告费' },
      storage:      { pct: 0.02, source: 'estimate' },
      return_cost:  { pct: 0.02, source: 'estimate' },
    }
  },
  tiktok_fbt: {
    label: 'TikTok FBT',
    total_est_pct: 0.76,
    profit_est_pct: 0.24,
    components: {
      product_cost: { pct: 0.20, source: 'api' },
      first_leg:    { pct: 0.06, source: 'api' },
      tariff:       { pct: 0.03, source: 'api' },
      fulfillment:  { pct: 0.12, source: 'estimate', note: 'FBT配送费' },
      commission:   { pct: 0.15, source: 'estimate', note: 'TikTok佣金 8-20%' },
      advertising:  { pct: 0.15, source: 'estimate', note: 'TikTok投流费较高' },
      storage:      { pct: 0.02, source: 'estimate' },
      return_cost:  { pct: 0.03, source: 'estimate', note: '退货率偏高' },
    }
  },
  mercado_full: {
    label: '美客多 Full',
    total_est_pct: 0.84,
    profit_est_pct: 0.16,
    components: {
      product_cost: { pct: 0.18, source: 'api' },
      first_leg:    { pct: 0.10, source: 'api', note: '头程物流较贵' },
      tariff:       { pct: 0.05, source: 'api', note: '拉美关税较高' },
      fulfillment:  { pct: 0.20, source: 'estimate', note: 'Full配送费(拉美物流贵)' },
      commission:   { pct: 0.18, source: 'estimate', note: '美客多佣金 16-20%' },
      advertising:  { pct: 0.08, source: 'estimate' },
      storage:      { pct: 0.03, source: 'estimate' },
      return_cost:  { pct: 0.02, source: 'estimate' },
    }
  },
  ozon_fbo: {
    label: 'OZON FBO',
    total_est_pct: 0.81,
    profit_est_pct: 0.19,
    components: {
      product_cost: { pct: 0.20, source: 'api' },
      first_leg:    { pct: 0.10, source: 'api' },
      tariff:       { pct: 0.08, source: 'api', note: '俄罗斯关税较高' },
      fulfillment:  { pct: 0.13, source: 'estimate', note: 'FBO配送费' },
      commission:   { pct: 0.15, source: 'estimate', note: 'OZON佣金 10-20%' },
      advertising:  { pct: 0.10, source: 'estimate' },
      storage:      { pct: 0.02, source: 'estimate' },
      return_cost:  { pct: 0.03, source: 'estimate', note: '退货率较高' },
    }
  },
  gucang: {
    label: '谷仓海外仓',
    total_est_pct: 0.72,
    profit_est_pct: 0.28,
    components: {
      product_cost: { pct: 0.20, source: 'api' },
      first_leg:    { pct: 0.06, source: 'api' },
      tariff:       { pct: 0.03, source: 'api' },
      fulfillment:  { pct: 0.12, source: 'estimate', note: '谷仓仓储+尾程配送' },
      commission:   { pct: 0.15, source: 'estimate', note: '取决于挂靠平台' },
      advertising:  { pct: 0.10, source: 'estimate' },
      storage:      { pct: 0.04, source: 'estimate', note: '谷仓仓储费' },
      return_cost:  { pct: 0.02, source: 'estimate' },
    }
  },
  shenzhen: {
    label: '深圳仓直发(小包)',
    total_est_pct: 0.84,
    profit_est_pct: 0.16,
    components: {
      product_cost: { pct: 0.25, source: 'api' },
      first_leg:    { pct: 0.22, source: 'estimate', note: '小包直发物流费' },
      tariff:       { pct: 0.03, source: 'api' },
      fulfillment:  { pct: 0.05, source: 'estimate', note: '国内打包操作费' },
      commission:   { pct: 0.15, source: 'estimate', note: '取决于挂靠平台' },
      advertising:  { pct: 0.10, source: 'estimate' },
      storage:      { pct: 0.01, source: 'estimate' },
      return_cost:  { pct: 0.03, source: 'estimate' },
    }
  },
  amazon_fbm: {
    label: 'Amazon FBM',
    total_est_pct: 0.74,
    profit_est_pct: 0.26,
    components: {
      product_cost: { pct: 0.20, source: 'api' },
      first_leg:    { pct: 0.15, source: 'api', note: '自发货运费' },
      tariff:       { pct: 0.03, source: 'api' },
      fulfillment:  { pct: 0.08, source: 'estimate', note: 'FBM配送费' },
      commission:   { pct: 0.15, source: 'estimate' },
      advertising:  { pct: 0.10, source: 'estimate' },
      storage:      { pct: 0.01, source: 'estimate' },
      return_cost:  { pct: 0.02, source: 'estimate' },
    }
  },
  etsy_fbm: {
    label: 'Etsy FBM',
    total_est_pct: 0.60,
    profit_est_pct: 0.40,
    components: {
      product_cost: { pct: 0.25, source: 'api' },
      first_leg:    { pct: 0.12, source: 'api', note: 'Etsy多为小包直发' },
      tariff:       { pct: 0.02, source: 'api' },
      fulfillment:  { pct: 0.05, source: 'estimate' },
      commission:   { pct: 0.08, source: 'estimate', note: 'Etsy佣金 6.5% + 刊登费' },
      advertising:  { pct: 0.05, source: 'estimate' },
      storage:      { pct: 0.01, source: 'estimate' },
      return_cost:  { pct: 0.02, source: 'estimate' },
    }
  },
  shopify_fbm: {
    label: 'Shopify FBM',
    total_est_pct: 0.70,
    profit_est_pct: 0.30,
    components: {
      product_cost: { pct: 0.25, source: 'api' },
      first_leg:    { pct: 0.15, source: 'api', note: '独立站物流' },
      tariff:       { pct: 0.02, source: 'api' },
      fulfillment:  { pct: 0.08, source: 'estimate' },
      commission:   { pct: 0.05, source: 'estimate', note: 'Shopify交易手续费 2.9%+$0.30' },
      advertising:  { pct: 0.10, source: 'estimate', note: '独立站引流费' },
      storage:      { pct: 0.01, source: 'estimate' },
      return_cost:  { pct: 0.04, source: 'estimate' },
    }
  },
};

// ============ 4. 汇率表 ============
const FX_RATES = { USD: 1, EUR: 0.91, JPY: 150, GBP: 0.79, CAD: 1.37, MXN: 20, AUD: 1.5 };

function toUsd(amount, cc) {
  return amount / (FX_RATES[cc] || 1);
}

// ============ 5. 核心函数 ============

/**
 * 根据订单识别最匹配的平台+物流组合
 */
function detectFulfillmentType(order) {
  const store = (order.store || order.OrderSourceName || '').toLowerCase();
  const isFBA = order.isFBA === true || order.isFbaOrder === 'true' || order.IsFBAOrder === 'true';
  const transport = (order.transportName || order.TransportName || '').toLowerCase();

  if (/amazon/.test(store)) return isFBA ? 'amazon_fba' : 'amazon_fbm';
  if (/walmart/.test(store)) return 'walmart_wfs';
  if (/tiktok|tk$/.test(store)) return 'tiktok_fbt';
  if (/mercado|mercadolibre|美客多/.test(store)) return 'mercado_full';
  if (/ozon/.test(store)) return 'ozon_fbo';
  if (/etzy|etsy/.test(store)) return 'etsy_fbm';
  if (/shopify/.test(store)) return 'shopify_fbm';

  // 通过仓库ID推断 (TODO: 完善映射)
  const wh = String(order.warehouseId || order.WareHouseID || '');
  
  return 'shenzhen'; // 默认
}

/**
 * 从订单API返回的原始字段提取已有成本数据
 */
function extractKnownCosts(order) {
  const currency = order.currency || order.Currency || 'USD';
  const productCost = parseFloat(order.cost || order.LastBuyPrice || 0);
  const firstLeg = parseFloat(order.firstLegFee || order.FirstLegFee || 0);
  const tariff = parseFloat(order.tariffFee || order.TariffFee || 0);
  const latestCost = parseFloat(order.productLatestCost || order.ProductLatestCost || 0);
  const sellingPrice = parseFloat(order.price || order.ProductPrice || 0);

  return {
    productCost, firstLeg, tariff, latestCost, sellingPrice, currency,
    knownCosts: { product_cost: productCost, first_leg: firstLeg, tariff: tariff },
    knownTotal: productCost + firstLeg + tariff,
    // 带单位成本用于更精确计算
    unitProductCost: productCost,
    unitFirstLeg: firstLeg,
    unitTariff: tariff,
  };
}

/**
 * 获取平台成本模型的各组件默认值
 */
function getDefaultComponents(fulfillmentKey) {
  return PLATFORM_COST_MODELS[fulfillmentKey] || null;
}

/**
 * 估算缺失的成本组件并构建完整成本分析
 */
function buildCostAnalysis(order, fulfillmentKey, customPct = {}) {
  const model = PLATFORM_COST_MODELS[fulfillmentKey];
  if (!model) return { error: '未知物流方式: ' + fulfillmentKey };

  const currency = order.currency || order.Currency || 'USD';
  const sellingPrice = toUsd(parseFloat(order.price || order.ProductPrice || 0), currency);
  const qty = parseInt(order.qty || order.ProductNum || 1) || 1;
  
  if (sellingPrice <= 0) return { error: '无效售价' };

  const known = extractKnownCosts(order);
  const components = {};
  let totalCost = 0;
  let knownTotal = 0;
  let estimateTotal = 0;

  for (const [compName, compDef] of Object.entries(COMPONENT_DEFS)) {
    const modelConfig = model.components[compName];
    if (!modelConfig) {
      components[compName] = { value: 0, pct: 0, label: compDef.label, source: 'none', isEstimated: false };
      continue;
    }

    // 已知成本 (已转为USD)
    const knownUsd = compName === 'product_cost' ? toUsd(known.productCost, currency) :
                     compName === 'first_leg' ? toUsd(known.firstLeg, currency) :
                     compName === 'tariff' ? toUsd(known.tariff, currency) : 0;

    // 用户自定义覆盖
    const userPct = customPct[compName] !== undefined ? customPct[compName] : modelConfig.pct;
    const estimated = sellingPrice * userPct;

    // 优先使用已知值, 否则用估算
    const value = knownUsd > 0 ? knownUsd : estimated;
    const source = knownUsd > 0 ? 'api' : 'estimate';

    components[compName] = {
      value,
      pct: sellingPrice > 0 ? value / sellingPrice : 0,
      label: compDef.label,
      source,
      isEstimated: knownUsd <= 0,
      note: modelConfig.note || '',
      pctOfPrice: userPct,
    };
    totalCost += value;
    if (knownUsd > 0) knownTotal += value;
    else estimateTotal += value;
  }

  const profit = sellingPrice - totalCost;
  const margin = sellingPrice > 0 ? profit / sellingPrice : 0;

  return {
    sellingPrice, qty, currency,
    components, totalCost, knownTotal, estimateTotal,
    estimateRatio: totalCost > 0 ? estimateTotal / totalCost : 1,
    profit: profit * qty,
    unitProfit: profit,
    profitMargin: margin,
    modelKey: fulfillmentKey,
    modelLabel: model.label,
  };
}

/**
 * 格式化输出成本分析报告
 */
function fmtCostAnalysis(analysis) {
  if (analysis.error) return 'Error: ' + analysis.error;
  const lines = [];
  lines.push('');
  lines.push('=== 平台成本结构分析 ===');
  lines.push('模型: ' + analysis.modelLabel);
  lines.push('单价: $' + analysis.sellingPrice.toFixed(2));
  lines.push('数量: ' + analysis.qty);
  lines.push('总价: $' + (analysis.sellingPrice * analysis.qty).toFixed(2));
  lines.push('');

  const sorted = Object.entries(analysis.components)
    .filter(([n,c]) => c.value > 0)
    .sort((a,b) => b[1].value - a[1].value);

  lines.push('成本组件            金额     占比    来源    备注');
  lines.push('' + '-'.repeat(65));
  for (const [name, comp] of sorted) {
    const lbl = comp.label.padEnd(14);
    const val = '$' + comp.value.toFixed(2).padStart(7);
    const pct = (comp.pct * 100).toFixed(1) + '%';
    const src = comp.isEstimated ? '估算' : 'API';
    const note = comp.note ? comp.note.substring(0, 20) : '';
    lines.push('  ' + lbl + ' ' + val + ' ' + pct.padStart(6) + ' ' + src.padStart(4) + ' ' + note);
  }

  lines.push('' + '-'.repeat(65));
  lines.push('  总成本: $' + analysis.totalCost.toFixed(2) + ' (' + (analysis.totalCost / analysis.sellingPrice * 100).toFixed(1) + '%)');
  lines.push('  已知(API): $' + analysis.knownTotal.toFixed(2) + ' | 估算: $' + analysis.estimateTotal.toFixed(2) + ' | 估算占比: ' + (analysis.estimateRatio * 100).toFixed(0) + '%');
  lines.push('  单位利润: $' + analysis.unitProfit.toFixed(2) + ' | 利润率: ' + (analysis.profitMargin * 100).toFixed(1) + '%');
  lines.push('  总利润(' + analysis.qty + '件): $' + analysis.profit.toFixed(2));

  if (analysis.estimateRatio > 0.5) {
    lines.push('');
    lines.push('  ⚠ 成本估算占比过高(' + (analysis.estimateRatio * 100).toFixed(0) + '%), 建议校准:');
    for (const [name, comp] of sorted) {
      if (comp.isEstimated) lines.push('    - ' + comp.label + ' (默认 ' + (comp.pctOfPrice * 100).toFixed(1) + '%)');
    }
  }
  return lines.join('\n');
}

/**
 * 生成校准指南 (用户从订单详情页获取实际费用后填入)
 */
function generateCalibrationGuide(platformKey) {
  const model = PLATFORM_COST_MODELS[platformKey];
  if (!model) return '未知平台: ' + platformKey;
  const lines = [];
  lines.push('=== ' + model.label + ' 成本校准指南 ===');
  lines.push('');
  lines.push('打开 赛盒ERP → 订单管理 → 已完成订单 → 查看订单 → 订单费用');
  lines.push('在下方填入实际金额 (按订单币种):');
  lines.push('');
  for (const [compName, compDef] of Object.entries(COMPONENT_DEFS)) {
    const mc = model.components[compName];
    if (!mc) continue;
    const pct = (mc.pct * 100).toFixed(1) + '%';
    const src = mc.source === 'api' ? '→ 可从API自动获取' : '→ 需要手动校准';
    const note = mc.note ? ' (' + mc.note + ')' : '';
    lines.push('  ' + compDef.label.padEnd(12) + ' | 默认: ' + pct.padStart(5) + ' ' + src + note);
    if (mc.source !== 'api') lines.push('                     | 实际金额: ______');
  }
  lines.push('');
  lines.push('校准后配置方法:');
  lines.push('  node scripts/analyze-orders.js --cost-calibrate ' + platformKey + ' --comp product_cost=0.18 --comp first_leg=0.05 ...');
  return lines.join('\n');
}

// ============ 6. 导出 ============
module.exports = {
  FULFILLMENT_TYPES,
  COMPONENT_DEFS,
  PLATFORM_COST_MODELS,
  FX_RATES, toUsd,
  detectFulfillmentType,
  extractKnownCosts,
  getDefaultComponents,
  buildCostAnalysis,
  fmtCostAnalysis,
  generateCalibrationGuide,
};

// ============ 7. CLI ============
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';
  if (cmd === 'guide') {
    const plat = args[1] || 'amazon_fba';
    console.log(generateCalibrationGuide(plat));
  } else if (cmd === 'demo') {
    const analysis = buildCostAnalysis({price:29.99,cost:5.50,firstLegFee:1.80,tariffFee:0.90,currency:'USD'}, 'amazon_fba');
    console.log(fmtCostAnalysis(analysis));
    console.log('');
    console.log(generateCalibrationGuide('amazon_fba'));
  } else {
    console.log('Usage:');
    console.log('  node scripts/cost-model.js demo            # Demo cost analysis');
    console.log('  node scripts/cost-model.js guide <type>    # Calibration guide');
    console.log('');
    console.log('Types: amazon_fba, walmart_wfs, tiktok_fbt, mercado_full, ozon_fbo, gucang, shenzhen');
  }
}
