"""
数据源模块 - SOAP API 客户端 + CSV 本地模式
自动重试3次，API不可用时降级到CSV
"""

import csv
import io
import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import URLError

from .config import Config, PROJECT_ROOT
from .logger import setup_logger
from .models import SaiheOrderItem, SaiheOrder, AdRecord, InventoryItem, OperatorMapping

logger = setup_logger("data_source")

PLATFORM_MAP = {
    0: "All", 1: "Amazon", 45: "Walmart",
    104: "TikTok", 57: "Etsy", 122: "Ozon", 50: "Shopify",
}


class DataSource:
    """数据源基类"""
    def __init__(self, config: Config):
        self.cfg = config

    def fetch_orders(self, days: int = 30, platform_types: Optional[list[int]] = None) -> list[SaiheOrder]:
        raise NotImplementedError

    def fetch_inventory(self) -> list[InventoryItem]:
        raise NotImplementedError

    def fetch_ads(self) -> list[AdRecord]:
        raise NotImplementedError

    def fetch_operator_mapping(self) -> list[OperatorMapping]:
        raise NotImplementedError


class SaiheAPIClient(DataSource):
    """赛盒ERP SOAP API 客户端"""

    def __init__(self, config: Config):
        super().__init__(config)
        self.base_url = f"https://{config.api_host}{config.order_api_path}"
        self.soap_action = "http://tempuri.org/GetOrders"

    def _build_soap_body(self, start_time: str, end_time: str,
                         source_type: int = 0, next_token: int = 0,
                         order_code: str = "") -> str:
        return f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
 xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Body><GetOrders xmlns="http://tempuri.org/"><orderRequest>
<CustomerID>{self.cfg.customer_id}</CustomerID>
<UserName>{self.cfg.username}</UserName>
<Password>{self.cfg.password}</Password>
<StartTime>{start_time}</StartTime>
<EndTime>{end_time}</EndTime>
<OrderSourceType>{source_type}</OrderSourceType>
<NextToken>{next_token}</NextToken>
<OrderCode>{order_code}</OrderCode>
</orderRequest></GetOrders></soap:Body></soap:Envelope>"""

    def _call(self, soap_body: str, retries: int = 3) -> str:
        for attempt in range(retries):
            try:
                req = Request(
                    self.base_url,
                    data=soap_body.encode("utf-8"),
                    headers={
                        "Content-Type": "text/xml; charset=utf-8",
                        "SOAPAction": self.soap_action,
                    },
                )
                with urlopen(req, timeout=60) as resp:
                    return resp.read().decode("utf-8")
            except URLError as e:
                logger.warning(f"API调用第{attempt+1}次失败: {e}")
                if attempt < retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise

    def _parse_order_xml(self, xml_text: str) -> list[SaiheOrder]:
        """从SOAP响应XML中解析订单"""
        orders = []
        root = ET.fromstring(xml_text)
        ns = {"s": "http://tempuri.org/"}
        result = root.find(".//s:GetOrdersResult", ns)
        if result is None or not result.text:
            return orders

        # 直接解析XML中的ApiOrderInfo节点
        items_raw = re.findall(r"<ApiOrderInfo>(.*?)</ApiOrderInfo>", result.text, re.DOTALL)
        for raw in items_raw:
            tp = self._extract_tag(raw, "TotalPrice")
            total_price = float(tp) if tp else 0.0
            if total_price <= 0:
                continue

            order = SaiheOrder(
                order_code=self._extract_tag(raw, "OrderCode"),
                store=self._extract_tag(raw, "OrderSourceName"),
                currency=self._extract_tag(raw, "Currency") or "USD",
                total_price=total_price,
                platform_type=int(self._extract_tag(raw, "OrderSourceType") or 0),
            )

            # 解析子项
            items_raw_list = re.findall(r"<ApiOrderList>(.*?)</ApiOrderList>", raw, re.DOTALL)
            for i_raw in items_raw_list:
                sku = self._extract_tag(i_raw, "SKU")
                if not sku:
                    continue
                qty_str = self._extract_tag(i_raw, "ProductNum")
                price_str = self._extract_tag(i_raw, "ProductPrice")
                item = SaiheOrderItem(
                    sku=sku,
                    client_sku=self._extract_tag(i_raw, "ClientSKU"),
                    seller_sku=self._extract_tag(i_raw, "SellerSKU"),
                    asin=self._extract_tag(i_raw, "ASIN"),
                    title=self._extract_tag(i_raw, "ItemTitle"),
                    qty=int(qty_str) if qty_str else 0,
                    price=float(price_str) if price_str else 0.0,
                    cost=float(self._extract_tag(i_raw, "LastBuyPrice") or 0),
                    first_leg_fee=float(self._extract_tag(i_raw, "FirstLegFee") or 0),
                    tariff_fee=float(self._extract_tag(i_raw, "TariffFee") or 0),
                    store=order.store,
                    currency=order.currency,
                )
                order.items.append(item)

            if order.items:
                orders.append(order)

        return orders

    @staticmethod
    def _extract_tag(xml_block: str, tag: str) -> str:
        m = re.search(rf"<{tag}>(.*?)</{tag}>", xml_block, re.DOTALL)
        return m.group(1).strip() if m else ""

    def fetch_orders(self, days: int = 30,
                     platform_types: Optional[list[int]] = None) -> list[SaiheOrder]:
        now = datetime.now()
        start = now - timedelta(days=days)
        fmt = "%Y-%m-%d %H:%M:%S"
        start_str = start.strftime(fmt)
        end_str = now.strftime(fmt)

        types = platform_types or DEFAULT_PLATFORMS
        all_orders = []

        for pt in types:
            logger.info(f"拉取平台类型 {pt} ({PLATFORM_MAP.get(pt, 'Other')}) 订单...")
            token = 0
            page = 0
            while page < 20:
                page += 1
                body = self._build_soap_body(start_str, end_str, pt, token)
                try:
                    raw = self._call(body, retries=3)
                    orders = self._parse_order_xml(raw)
                    all_orders.extend(orders)
                    # 检查是否有下一页
                    has_more = re.search(r"<IsSetOrders>true</IsSetOrders>", raw)
                    next_token_m = re.search(r"<NextToken>(\d+)</NextToken>", raw)
                    if has_more and next_token_m and orders:
                        token = int(next_token_m.group(1))
                    else:
                        break
                    if len(orders) == 0:
                        break
                except Exception as e:
                    logger.error(f"平台{pt}第{page}页出错: {e}")
                    break
            logger.info(f"  平台{pt}: 共 {len([o for o in all_orders if o.platform_type == pt])} 条")

        logger.info(f"API总订单数: {len(all_orders)}")
        return all_orders


class CSVDataSource(DataSource):
    """CSV文件数据源（离线/本地模式）"""

    def __init__(self, config: Config):
        super().__init__(config)

    def _read_csv(self, path: str) -> list[dict]:
        p = Path(path)
        if not p.exists():
            logger.warning(f"CSV文件不存在: {path}，跳过")
            return []
        with open(p, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            return list(reader)

    def fetch_orders(self, days: int = 30, platform_types: Optional[list[int]] = None) -> list[SaiheOrder]:
        rows = self._read_csv(self.cfg.orders_csv)
        orders = []
        for row in rows:
            order = SaiheOrder(
                order_code=row.get("order_code", ""),
                store=row.get("store", ""),
                currency=row.get("currency", "USD"),
                total_price=float(row.get("total_price", 0)),
                platform_type=int(row.get("platform_type", 0)),
            )
            item = SaiheOrderItem(
                sku=row.get("sku", ""),
                client_sku=row.get("client_sku", ""),
                seller_sku=row.get("seller_sku", ""),
                asin=row.get("asin", ""),
                title=row.get("title", ""),
                qty=int(row.get("qty", 0)),
                price=float(row.get("price", 0)),
                cost=float(row.get("cost", 0)),
                store=order.store,
                currency=order.currency,
            )
            order.items.append(item)
            orders.append(order)
        logger.info(f"CSV读取订单: {len(orders)} 条")
        return orders

    def fetch_ads(self) -> list[AdRecord]:
        rows = self._read_csv(self.cfg.ads_csv)
        return [
            AdRecord(
                sku=r.get("sku", ""),
                ad_spend=float(r.get("ad_spend", 0)),
                impressions=int(r.get("impressions", 0)),
                clicks=int(r.get("clicks", 0)),
                date=r.get("date", ""),
            )
            for r in rows
        ]

    def fetch_inventory(self) -> list[InventoryItem]:
        rows = self._read_csv(self.cfg.inventory_csv)
        return [
            InventoryItem(
                sku=r.get("sku", ""),
                client_sku=r.get("client_sku", ""),
                quantity=int(r.get("quantity", 0)),
                safety_stock=int(r.get("safety_stock", 0)),
                in_transit=int(r.get("in_transit", 0)),
            )
            for r in rows
        ]

    def fetch_operator_mapping(self) -> list[OperatorMapping]:
        rows = self._read_csv(self.cfg.operator_mapping_csv)
        return [
            OperatorMapping(
                sku=r.get("sku", ""),
                client_sku=r.get("client_sku", ""),
                operator=r.get("operator", ""),
                category=r.get("category", ""),
            )
            for r in rows
        ]

    def fetch_sales_90d(self) -> list[dict]:
        return self._read_csv(self.cfg.sales_90d_csv)

    def fetch_profit_detail(self) -> list[dict]:
        return self._read_csv(self.cfg.profit_detail_csv)


def create_data_source(config: Config) -> DataSource:
    """工厂方法 - 根据配置选择数据源"""
    if config.data_mode == "api":
        try:
            client = SaiheAPIClient(config)
            logger.info("使用API数据源")
            return client
        except Exception as e:
            logger.warning(f"API初始化失败({e})，自动降级到CSV模式")
            return CSVDataSource(config)
    else:
        logger.info("使用CSV数据源")
        return CSVDataSource(config)


def save_orders_to_csv(orders: list[SaiheOrder], output_dir: str) -> str:
    """将API拉取的订单保存为CSV（供后续模块使用）"""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    path = out / f"orders_{today}.csv"

    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow([
            "order_code", "store", "currency", "total_price",
            "sku", "client_sku", "asin", "title",
            "qty", "price", "cost", "platform_type",
        ])
        for order in orders:
            for item in order.items:
                writer.writerow([
                    order.order_code, order.store, order.currency,
                    order.total_price, item.sku, item.client_sku,
                    item.asin, item.title, item.qty, item.price,
                    item.cost, order.platform_type,
                ])

    logger.info(f"订单已保存: {path}")
    return str(path)
logger = setup_logger("data_source")

# Default platform types (instead of All=0 which often returns empty)
DEFAULT_PLATFORMS = [1, 45, 104, 57, 122, 50]  # Amazon, Walmart, TikTok, Etsy, Ozon, Shopify
