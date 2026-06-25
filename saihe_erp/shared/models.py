"""
数据模型 - 所有模块共用的数据结构
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


FX_RATES = {"USD": 1.0, "EUR": 0.91, "JPY": 150.0, "GBP": 0.79, "CAD": 1.37, "MXN": 20.0, "AUD": 1.5}


def to_usd(amount: float, currency: str) -> float:
    rate = FX_RATES.get(currency.upper(), 1.0)
    return amount / rate


@dataclass
class SaiheOrderItem:
    """订单内单个SKU行"""
    sku: str
    client_sku: str = ""
    seller_sku: str = ""
    asin: str = ""
    title: str = ""
    qty: int = 0
    price: float = 0.0
    cost: float = 0.0
    first_leg_fee: float = 0.0
    tariff_fee: float = 0.0
    store: str = ""
    currency: str = "USD"

    @property
    def revenue_usd(self) -> float:
        return to_usd(self.price * self.qty, self.currency)

    @property
    def cost_total(self) -> float:
        return self.cost * self.qty


@dataclass
class SaiheOrder:
    """完整订单"""
    order_code: str = ""
    store: str = ""
    currency: str = "USD"
    total_price: float = 0.0
    order_time: Optional[datetime] = None
    platform_type: int = 0
    items: list = field(default_factory=list)
    is_ad_order: bool = False

    @property
    def total_usd(self) -> float:
        return to_usd(self.total_price, self.currency)


@dataclass
class StoreSummary:
    """店铺维度汇总"""
    store: str = ""
    total_sales: float = 0.0
    total_refund: float = 0.0
    net_sales: float = 0.0
    order_count: int = 0
    avg_order_value: float = 0.0
    return_rate: float = 0.0
    ad_spend: float = 0.0
    acos: float = 0.0


@dataclass
class ProductSummary:
    """产品维度汇总"""
    sku: str = ""
    client_sku: str = ""
    asin: str = ""
    title: str = ""
    qty: int = 0
    revenue: float = 0.0
    revenue_usd: float = 0.0
    cost: float = 0.0
    gross_margin: float = 0.0
    stores: list = field(default_factory=list)
    operator: str = ""


@dataclass
class AdRecord:
    """广告数据行"""
    sku: str = ""
    ad_spend: float = 0.0
    impressions: int = 0
    clicks: int = 0
    date: str = ""


@dataclass
class InventoryItem:
    """库存快照"""
    sku: str = ""
    client_sku: str = ""
    quantity: int = 0
    safety_stock: int = 0
    in_transit: int = 0
    last_sale_date: Optional[datetime] = None
    avg_daily_sales: float = 0.0


@dataclass
class OperatorMapping:
    """运营人映射"""
    sku: str = ""
    client_sku: str = ""
    operator: str = ""
    category: str = ""
