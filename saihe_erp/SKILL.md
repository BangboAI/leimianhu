---
name: saihe-erp-analyzer
description: >-
  连接赛盒ERP(irobotbox) SOAP API，抓取Amazon/Walmart/TikTok/Etsy/Ozon/Shopify等
  多平台订单数据，自动分析产品销售排名、毛利率、跨平台潜力、品类分布、环比趋势，
  并通过 GetOrderSettlementReport 输出真实利润数据。
---

# 赛盒ERP v3 订单数据分析 Skill

通过赛盒ERP开放API抓取订单数据，自动分析所有平台的产品表现，输出高潜产品排名、品类趋势和决策建议。支持真实结算利润分析。

## 安装方法

### 从 GitHub 安装（推荐）
在 Codex 中：
```
/skill-installer BangboAI/leimianhu
```

### 参数说明
| 参数 | 环境变量 | 说明 |
|------|---------|------|
| --host | SAIHE_HOST | API主机 (默认 gg16.irobotbox.com) |
| --user | SAIHE_USERNAME | 赛盒ERP登录邮箱 |
| --pass | SAIHE_PASSWORD | 登录密码 |
| --days | SAIHE_DAYS | 分析天数 (默认30) |
| --format | SAIHE_FORMAT | 输出格式 text/json/html |

## 工具1：订单趋势分析
```
node scripts/analyze-orders.js --user USER --pass PASS --days 30
```
输出：品类分析、店铺排名、TOP15高潜产品、跨平台SKU、产品趋势、平台成本结构

## 工具2：真实利润分析（v3新增）
```
node scripts/settlement-profit.js --user USER --pass PASS --days 365
```
调用 GetOrderSettlementReport 获取真实财务数据，按SKU聚合利润分析

## 工具3：成本模型校准
```
node scripts/cost-model.js demo
node scripts/cost-model.js guide amazon_fba
```
定义10种物流方式 × 9项成本组件的估算模型

## 日常使用
```
# 每周：30天趋势
node scripts/analyze-orders.js --days 30

# 每月：真实利润
node scripts/settlement-profit.js --days 90

# 季度：成本校准
node scripts/cost-model.js demo
```
