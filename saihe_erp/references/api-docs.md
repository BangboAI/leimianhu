# 赛盒ERP SOAP API Reference

## Base URL
`https://{host}/Api/API_Irobotbox_Orders.asmx`
Default host: `gg16.irobotbox.com`

Product management: `https://{host}/Api/API_ProductInfoManage.asmx`

## Authentication
Every request requires `CustomerID`, `UserName`, `Password` in the request body.

- CustomerID: The 供应商号 (e.g., 1502)
- UserName: Email login (e.g., leimianhu@loeldeal.com)
- Password: Login password (e.g., LOELcase3322)

## Key API: GetOrders
Fetches orders with pagination. This is the primary API for data analysis.

**SOAPAction**: `http://tempuri.org/GetOrders`

**Parameters**:
- CustomerID (int): 供应商号
- UserName (string): 登录用户名(邮箱)
- Password (string): 登录密码
- StartTime (string): Start time (yyyy-MM-dd HH:mm:ss)
- EndTime (string): End time
- OrderSourceType (int): Platform filter. 0=all, 1=Amazon, 45=Walmart, 104=TikTok, 57=Etsy, 122=Ozon, 50=Shopify
- NextToken (int): Pagination token (0 for first page)
- OrderCode (string): Specific order code
- OrderListStatus (string): Status filter
- WareHouseID (int): Warehouse filter

**Response Order items**:
- SKU: Internal product SKU number
- ClientSKU: Business SKU (e.g., 55-AV075-2)
- SellerSKU: Platform listing SKU
- ASIN: Amazon ASIN
- ItemTitle: Product listing title
- ProductNum: Quantity sold
- ProductPrice: Unit price in local currency
- LastBuyPrice: Last purchase cost
- ProductLinks: Product URL
- FirstLegFee: First leg shipping fee
- TariffFee: Customs duty
- OrderSourceName: Store name (e.g., Amazon-KAWELL-US)
- Currency: Currency code (USD/EUR/JPY/GBP/CAD)
- TotalPrice: Total order amount

## Other APIs
- GetWareHouseList: List all warehouses
- GetOrderSourceList: List all stores (pass OrderSourceType=0)
- GetTransportList: Get shipping methods
- UpdateProductStockNumber: Update stock levels
- ProcessUpdateProduct: Create/update products

## Currency Conversion
When analyzing, convert non-USD using:
- USD: x1.0 | EUR: x1.10 | JPY: x0.0067 | GBP: x1.27 | CAD: x0.75


## v2 更新

- **2026-06-26**: 分类引擎升级至12品类，支持多语言品名识别（英文/中文/日文/德文/法文/西班牙文/意大利文）
- **2026-06-26**: 新增环比趋势对比（当前30天 vs 上30天），品类和店铺均显示增长率
- **2026-06-26**: 新增店铺级别品类拆分
- **2026-06-26**: 输出增加品类占比柱状图和SKU平均营收指标
