"""
赛盒ERP分析工具 - 统一配置加载模块
优先级: 环境变量 > config.json > 默认值
"""

import os
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = PROJECT_ROOT / "config.json"


@dataclass
class Config:
    # 赛盒API
    api_host: str = "gg16.irobotbox.com"
    customer_id: str = "1502"
    username: str = ""
    password: str = ""
    order_api_path: str = "/Api/API_Irobotbox_Orders.asmx"

    # 数据源模式: "api" 或 "csv"
    data_mode: str = "api"

    # CSV路径（data_mode="csv" 时使用）
    csv_dir: str = ""
    orders_csv: str = ""
    ads_csv: str = ""
    inventory_csv: str = ""
    sales_90d_csv: str = ""
    operator_mapping_csv: str = ""
    profit_detail_csv: str = ""

    # 每日导出目录（日常流水线用）
    daily_exports_dir: str = ""
    daily_history_dir: str = ""

    # 汇率（往USD折算）
    fx_rates: dict = field(default_factory=lambda: {
        "USD": 1.0, "EUR": 0.91, "JPY": 150.0,
        "GBP": 0.79, "CAD": 1.37, "MXN": 20.0, "AUD": 1.5,
    })

    # API时区（赛盒返回时间的时区）
    api_timezone: str = "Asia/Shanghai"

    # 邮件
    email_sender: str = ""
    email_password: str = ""
    email_receiver: list = field(default_factory=list)
    email_smtp_host: str = "smtp.qq.com"
    email_smtp_port: int = 465

    # 异常规则
    revenue_drop_threshold: float = 0.20  # 销售额环比下降超20%视为异常
    return_rate_threshold: float = 0.10   # 退货率超10%视为异常

    # 策略参数
    safety_stock_days: int = 7
    replenish_multiplier: float = 1.5

    # 低库存预警天数
    low_stock_warning_days: int = 30

    @classmethod
    def from_env(cls) -> "Config":
        """从环境变量加载（优先级最高）"""
        c = cls()
        if v := os.environ.get("SAIHE_HOST"):
            c.api_host = v
        if v := os.environ.get("SAIHE_CUSTOMER_ID"):
            c.customer_id = v
        if v := os.environ.get("SAIHE_USERNAME"):
            c.username = v
        if v := os.environ.get("SAIHE_PASSWORD"):
            c.password = v
        if v := os.environ.get("SAIHE_DATA_MODE"):
            c.data_mode = v
        if v := os.environ.get("SAIHE_CSV_DIR"):
            c.csv_dir = v
        if v := os.environ.get("SAIHE_EMAIL_SENDER"):
            c.email_sender = v
        if v := os.environ.get("SAIHE_EMAIL_PASSWORD"):
            c.email_password = v
        if v := os.environ.get("SAIHE_EMAIL_RECEIVER"):
            c.email_receiver = [x.strip() for x in v.split(",") if x.strip()]
        return c

    def merge_json(self, d: dict) -> None:
        """用 JSON 字典覆盖配置"""
        for key, val in d.items():
            if hasattr(self, key) and val is not None:
                setattr(self, key, val)

    def resolve_csv_paths(self) -> None:
        """补全CSV路径（如果只配了 csv_dir）"""
        base = Path(self.csv_dir) if self.csv_dir else PROJECT_ROOT / "data"
        self.orders_csv = self.orders_csv or str(base / "orders.csv")
        self.ads_csv = self.ads_csv or str(base / "ads.csv")
        self.inventory_csv = self.inventory_csv or str(base / "inventory.csv")
        self.sales_90d_csv = self.sales_90d_csv or str(base / "sales_90d.csv")
        self.operator_mapping_csv = self.operator_mapping_csv or str(base / "operator_mapping.csv")
        self.profit_detail_csv = self.profit_detail_csv or str(base / "profit_detail.csv")
        self.daily_exports_dir = self.daily_exports_dir or str(base / "daily_exports")
        self.daily_history_dir = self.daily_history_dir or str(base / "daily_history")


def load_config(path: Optional[str] = None) -> Config:
    """加载配置: 环境变量 > JSON文件 > 默认值"""
    cfg = Config.from_env()

    config_path = Path(path) if path else DEFAULT_CONFIG_PATH
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cfg.merge_json(data)

    cfg.resolve_csv_paths()
    return cfg


def save_config_template(path: Optional[str] = None) -> str:
    """生成 config.example.json"""
    template = {
        "api_host": "gg16.irobotbox.com",
        "customer_id": "1502",
        "username": "",
        "password": "",
        "data_mode": "api",
        "csv_dir": "./data",
        "email_sender": "you@qq.com",
        "email_password": "your_smtp_authorization_code",
        "email_receiver": ["boss@company.com"],
        "fx_rates": {"USD": 1.0, "EUR": 0.91, "JPY": 150.0, "GBP": 0.79, "CAD": 1.37},
    }
    dst = Path(path) if path else PROJECT_ROOT / "config.example.json"
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(template, f, ensure_ascii=False, indent=2)
    return str(dst)
