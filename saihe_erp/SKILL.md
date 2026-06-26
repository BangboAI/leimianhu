---
name: saihe-erp-analyzer
description: 连接赛盒ERP(irobotbox) SOAP API，抓取Amazon/Walmart/TikTok/Etsy/Ozon/Shopify等多平台订单数据，自动分析产品销售收入排名、毛利率、跨平台潜力、品类分布、环比趋势，找出最值得重点打造的高潜产品。
---

# 赛盒ERP v2 订单数据分析

通过赛盒ERP开放API抓取订单数据，自动分析所有平台的产品表现，输出高潜产品排名、品类趋势和决策建议。

## 配置

首次使用时，需要提供赛盒ERP的登录信息：

`
SAIHE_HOST=gg16.irobotbox.com
SAIHE_CUSTOMER_ID=1502
SAIHE_USERNAME=you@email.com
SAIHE_PASSWORD=your_password
`

## 使用方法

`
node scripts/analyze-orders.js --user USER --pass PASS
`

输出包含：品类排名、店铺营收排名（含环比趋势）、TOP15高潜产品、跨平台机会、高毛利产品、决策建议。

## 脚本参数

| 参数 | 环境变量 | 默认值 | 说明 |
|------|---------|--------|------|
| --host | SAIHE_HOST | gg16.irobotbox.com | API主机地址 |
| --cid | SAIHE_CUSTOMER_ID | 1502 | 供应商号 |
| --user | SAIHE_USERNAME | - | 登录邮箱 |
| --pass | SAIHE_PASSWORD | - | 登录密码 |
| --days | SAIHE_DAYS | 30 | 分析天数 |
| --format | SAIHE_FORMAT | text | 输出格式(text/json) |

## 分类引擎 v2（12品类，多语言）

支持英文/中文/日文/德文/法文/西班牙文/意大利文品名匹配：

- LED Lights: light/led/灯/ライト/Wandleuchte/Lampe/Lumiere/Lustre
- Bags: bag/Sac/Mochila/Bolso/Zaino/Tasche/backpack
- Girls Apparel: princess/dress/tulle/gown/bike short/bra
- Boys Apparel: boys short/athletic/tank top/7-pack
- Wallets: wallet/card case/purse/badge holder
- Swimwear: swim/bikini/rash guard/swimsuit
- Electronics: HDMI/DP/usb cable/charger
- Compression Socks
- Underwear
- Kids Costumes
- Other

## 环比趋势

自动拉取当前30天和上30天两段数据，计算每个品类和店铺的增长率。
上箭头+ 表示增长，下箭头表示下降，NEW表示新开店。

## 输出解读

品类分析按营收降序排列，显示营收、占比、SKU数、件数、店铺数、环比趋势。
店铺排名含环比增长率，重点关注上箭头100%+的爆发渠道。
TOP15按营收排列，跨平台SKU已在2+站点验证。

## 定时自动化

`
node scripts/analyze-orders.js --format json > daily-report.json
`

## API详情

见 references/api-docs.md