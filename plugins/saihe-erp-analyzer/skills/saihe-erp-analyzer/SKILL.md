---
name: saihe-erp-analyzer
description: 连接赛盒ERP(irobotbox) SOAP API，抓取Amazon/Walmart/TikTok/Etsy/Ozon/Shopify等多平台订单数据，自动分析产品销售收入排名、毛利率、跨平台潜力、品类分布，找出最值得重点打造的高潜产品。当用户需要：分析ERP中的订单数据、找爆款/潜力品、每天自动出运营日报、跨平台产品对比、了解哪个产品最值得投入资源开发时使用。
---

# 赛盒ERP订单数据分析

通过赛盒ERP开放API抓取订单数据，自动分析所有平台的产品表现，输出高潜产品排名和决策建议。

## 配置

首次使用时，需要提供赛盒ERP的登录信息。可以通过以下两种方式：

1. **环境变量**（推荐用于自动化）：
   ```
   SAIHE_HOST=gg16.irobotbox.com
   SAIHE_CUSTOMER_ID=1502
   SAIHE_USERNAME=you@email.com
   SAIHE_PASSWORD=your_password
   SAIHE_FORMAT=text  # 或 json
   ```

2. **命令行参数**（推荐用于临时分析）：
   ```
   node scripts/analyze-orders.js --user you@email.com --pass your_password --days 30
   ```

## 使用方法

### 基本分析
```
node scripts/analyze-orders.js --user USER --pass PASS
```
输出包含：店铺营收排名、品类分析、TOP15高潜产品、跨平台机会、高毛利产品、决策建议。

### 仅JSON输出（供其他程序消费）
```
node scripts/analyze-orders.js --user USER --pass PASS --format json
```

### 指定分析天数
```
node scripts/analyze-orders.js --user USER --pass PASS --days 7
```

### 指定API主机
```
node scripts/analyze-orders.js --host gg16.irobotbox.com --user USER --pass PASS
```

## 脚本参数

| 参数 | 环境变量 | 默认值 | 说明 |
|------|---------|--------|------|
| --host | SAIHE_HOST | gg16.irobotbox.com | API主机地址 |
| --cid | SAIHE_CUSTOMER_ID | 1502 | 供应商号 |
| --user | SAIHE_USERNAME | - | 登录邮箱 |
| --pass | SAIHE_PASSWORD | - | 登录密码 |
| --days | SAIHE_DAYS | 30 | 分析天数 |
| --format | SAIHE_FORMAT | text | 输出格式(text/json) |

## 分析逻辑

脚本自动执行以下步骤：

### 1. 数据抓取
- 遍历6大平台类型(Amazon->Walmart->TikTok->Etsy->Ozon->Shopify)
- 对每个平台分页拉取所有订单
- 过滤掉金额为零的记录(FBA调拨单等)
- 提取每笔订单中的SKU、销量、单价、成本、ASIN、店铺名等信息

### 2. 分类引擎
根据产品标题和ClientSKU自动分类到品类：
- **light**: LED灯具、照明设备、车灯（日本主力）
- **bag**: 箱包、背包、斜挎包、腰包、旅行包
- **accessory**: 钱包、卡包、钥匙包、手包
- **electronic**: 电子配件（HDMI、充电器等）
- **other**: 其他

### 3. 多币种统一换算
自动将JPY/EUR/GBP/CAD等不同币种换算为USD，方便统一比较。

### 4. 排名与洞察
- 店铺营收排名
- 品类营收占比
- 单品营收排名（TOP15）
- 跨平台销售SKU识别（已在多站出货的，最具复制潜力）
- 高毛利产品识别（毛利率>60%）

### 5. 决策建议输出
自动基于分析结果给出三条具体行动建议。

## 输出解读

输出中最重要的几个板块：

**「TOP 15 高潜产品」**
按营收USD降序排列。重点看同时满足以下条件的SKU：
- 高营收（> $100 USD）
- 已知成本（Cost > 0）
- 跨平台销售

**「跨平台SKU（可复制到其他站）」**
已在2个以上平台/站点销售的SKU，说明产品已验证了跨市场需求，是推新站的首选。

**「高毛利产品（毛利率>60%）」**
成本已知且毛利率高的产品，优化Listing曝光可立即带来更多利润。

## 定时自动化

要让分析每天自动运行：

1. 设置环境变量（避免明文密码在命令行）
2. 添加到定时任务（Windows Task Scheduler / crontab）
3. 输出重定向到文件：
   ```
   node scripts/analyze-orders.js --format json > daily-report.json
   ```
4. 可将JSON结果接入BANGBOAI等智能体，每天早上自动推送报告

## API详情

见 [api-docs.md](references/api-docs.md) 了解完整的SOAP API接口文档。
