"""
模块一：自动生成销售日报/周报

用法:
  python scripts/daily_report.py                # 昨日日报
  python scripts/daily_report.py --days 7       # 近7天周报
  python scripts/daily_report.py --no-email     # 仅生成文件不发送
  python scripts/daily_report.py --csv-mode     # 使用CSV数据源

依赖: shared/, openpyxl (可选，仅Excel输出)
"""

import argparse
import csv
import json
import smtplib
import sys
import time
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

# 将项目根目录加入sys.path
_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))

from shared.config import load_config, PROJECT_ROOT
from shared.logger import setup_logger
from shared.models import SaiheOrder, SaiheOrderItem, to_usd, StoreSummary
from shared.data_source import create_data_source, save_orders_to_csv

logger = setup_logger("daily_report")


def compute_store_summaries(orders: list[SaiheOrder]) -> dict[str, StoreSummary]:
    """计算每个店铺的汇总指标"""
    stores: dict[str, StoreSummary] = {}

    for order in orders:
        store_name = order.store or "Unknown"
        if store_name not in stores:
            stores[store_name] = StoreSummary(store=store_name)

        s = stores[store_name]
        s.order_count += 1
        s.total_sales += order.total_usd
        s.total_refund += 0  # API不直接返回退款，需要从其他接口获取

        for item in order.items:
            s.ad_spend += 0  # 广告费需要从广告模块获取

    # 计算衍生指标
    for s in stores.values():
        s.net_sales = s.total_sales - s.total_refund
        s.avg_order_value = s.net_sales / s.order_count if s.order_count > 0 else 0
        s.return_rate = s.total_refund / s.total_sales if s.total_sales > 0 else 0
        s.acos = s.ad_spend / s.total_sales if s.total_sales > 0 else 0

    return stores


def load_yesterday_history() -> Optional[dict]:
    """读取前一日的历史快照用于环比"""
    hist_dir = PROJECT_ROOT / "daily_history"
    if not hist_dir.exists():
        return None
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    hist_file = hist_dir / f"snapshot_{yesterday}.json"
    if hist_file.exists():
        with open(hist_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def save_snapshot(stores: dict[str, StoreSummary], top_skus: list[dict]):
    """保存今日快照用于明日环比"""
    hist_dir = PROJECT_ROOT / "daily_history"
    hist_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    snapshot = {
        "date": today,
        "stores": {k: {"total_sales": v.total_sales, "net_sales": v.net_sales,
                       "order_count": v.order_count} for k, v in stores.items()},
        "top_skus": top_skus,
    }
    hist_file = hist_dir / f"snapshot_{today}.json"
    with open(hist_file, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)


def generate_markdown_report(
    stores: dict[str, StoreSummary],
    top_sku_list: list[dict],
    previous: Optional[dict] = None,
    days: int = 1,
) -> str:
    """生成Markdown格式日报"""
    lines = []
    period = "昨日" if days == 1 else f"近{int(days)}天"
    today = datetime.now().strftime("%Y-%m-%d")
    lines.append(f"# 赛盒ERP销售日报 ({today})")
    lines.append(f"**周期**: {period}  |  **生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("")

    # 总体摘要
    total_sales = sum(s.total_sales for s in stores.values())
    total_orders = sum(s.order_count for s in stores.values())
    total_net = sum(s.net_sales for s in stores.values())
    lines.append("## 总体概况")
    lines.append(f"- **总销售额**: ${total_sales:.2f}")
    lines.append(f"- **净销售额**: ${total_net:.2f}")
    lines.append(f"- **总订单数**: {total_orders}")
    lines.append(f"- **店铺数**: {len(stores)}")
    lines.append("")

    total_prev_sales = None
    if previous:
        total_prev_sales = sum(
            s.get("total_sales", 0) for s in previous.get("stores", {}).values()
        )
        if total_prev_sales > 0:
            change = (total_sales - total_prev_sales) / total_prev_sales * 100
            emoji = "📈" if change >= 0 else "📉"
            lines.append(f"> **环比**: {emoji} {change:+.1f}% (前日 ${total_prev_sales:.2f})")
            lines.append("")

    # 店铺明细表
    lines.append("## 店铺明细")
    lines.append("| 店铺 | 销售额 | 净销售额 | 订单数 | 客单价 | 退货率 | ACOS | 环比 |")
    lines.append("|------|--------|----------|--------|--------|--------|------|------|")

    sorted_stores = sorted(stores.values(), key=lambda s: s.total_sales, reverse=True)
    for s in sorted_stores:
        prev_sales = None
        if previous:
            prev_sales = previous.get("stores", {}).get(s.store, {}).get("total_sales")
        change_str = ""
        if prev_sales and prev_sales > 0:
            pct = (s.total_sales - prev_sales) / prev_sales * 100
            mark = "🔴" if pct < -20 else ""
            change_str = f"{pct:+.1f}%{mark}"

        lines.append(
            f"| {s.store} | ${s.total_sales:.2f} | ${s.net_sales:.2f} "
            f"| {s.order_count} | ${s.avg_order_value:.2f} "
            f"| {s.return_rate*100:.1f}% | {s.acos*100:.1f}% | {change_str} |"
        )
    lines.append("")

    # 异常店铺列表
    anomalies = []
    for s in sorted_stores:
        prev_sales = None
        if previous:
            prev_sales = previous.get("stores", {}).get(s.store, {}).get("total_sales")
        if prev_sales and prev_sales > 0:
            pct = (s.total_sales - prev_sales) / prev_sales * 100
            if pct < -20:
                anomalies.append(f"- **{s.store}**: 销售额环比下降 {pct:.1f}% (${prev_sales:.2f} → ${s.total_sales:.2f})")
        if s.return_rate > 0.10:
            anomalies.append(f"- **{s.store}**: 退货率 {s.return_rate*100:.1f}% (超过10%阈值)")

    if anomalies:
        lines.append("## ⚠️ 异常提醒")
        lines.extend(anomalies)
        lines.append("")

    # TOP 15 SKU
    lines.append("## 销量 Top 15 SKU")
    lines.append("| 排名 | SKU | 标题 | 销量 | 销售额(USD) | 成本 | 毛利 | 毛利率 |")
    lines.append("|------|-----|------|------|-------------|------|------|--------|")
    for i, p in enumerate(top_sku_list[:15], 1):
        margin = p["revenue_usd"] - p["cost_total"]
        margin_pct = (margin / p["revenue_usd"] * 100) if p["revenue_usd"] > 0 else 0
        title = (p.get("title") or p.get("client_sku") or p["sku"])[:40]
        lines.append(
            f"| {i} | {p['sku']} | {title} | {p['qty']} "
            f"| ${p['revenue_usd']:.2f} | ${p['cost_total']:.2f} "
            f"| ${margin:.2f} | {margin_pct:.1f}% |"
        )
    lines.append("")

    lines.append("---")
    lines.append("*赛盒ERP分析工具自动生成*")

    return "\n".join(lines)


def send_email(report_md: str, subject: str, config) -> bool:
    """发送日报邮件"""
    if not config.email_sender or not config.email_password:
        logger.warning("邮件配置不完整，跳过发送")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = config.email_sender
        msg["To"] = ", ".join(config.email_receiver)

        part_html = MIMEText(report_md, "markdown", "utf-8")
        msg.attach(part_html)

        with smtplib.SMTP_SSL(config.email_smtp_host, config.email_smtp_port) as server:
            server.login(config.email_sender, config.email_password)
            server.send_message(msg)

        logger.info(f"邮件已发送至 {config.email_receiver}")
        return True
    except smtplib.SMTPAuthenticationError:
        logger.error("邮件认证失败，请检查授权码（QQ邮箱需使用授权码而非登录密码）")
    except smtplib.SMTPException as e:
        logger.error(f"邮件发送失败: {e}")
    except Exception as e:
        logger.error(f"邮件发送异常: {e}")
    return False


def compute_top_skus(orders: list[SaiheOrder], limit: int = 50) -> list[dict]:
    """按SKU聚合计算排名"""
    sku_map: dict[str, dict] = {}
    for order in orders:
        for item in order.items:
            key = item.sku
            if key not in sku_map:
                sku_map[key] = {
                    "sku": item.sku,
                    "client_sku": item.client_sku,
                    "asin": item.asin,
                    "title": item.title,
                    "qty": 0,
                    "revenue_usd": 0.0,
                    "cost_total": 0.0,
                    "stores": set(),
                }
            p = sku_map[key]
            p["qty"] += item.qty
            p["revenue_usd"] += to_usd(item.price * item.qty, item.currency)
            p["cost_total"] += item.cost * item.qty
            p["stores"].add(order.store)
            if item.title:
                p["title"] = item.title

    # 转为列表并排序
    result = []
    for p in sku_map.values():
        p["stores"] = list(p["stores"])
        result.append(p)
    result.sort(key=lambda x: x["revenue_usd"], reverse=True)
    return result[:limit]


def main():
    parser = argparse.ArgumentParser(description="赛盒ERP销售日报")
    parser.add_argument("--days", type=int, default=1, help="分析天数 (默认1=昨日)")
    parser.add_argument("--no-email", action="store_true", help="不发送邮件")
    parser.add_argument("--csv-mode", action="store_true", help="使用CSV数据源(而非API)")
    parser.add_argument("--config", type=str, help="配置文件路径")
    parser.add_argument("--output-dir", type=str, default=None, help="报告输出目录")
    args = parser.parse_args()

    config = load_config(args.config)
    if args.csv_mode:
        config.data_mode = "csv"

    logger.info(f"开始生成{'周报' if args.days > 1 else '日报'}, 周期={args.days}天")

    # 1. 获取数据
    ds = create_data_source(config)
    try:
        orders = ds.fetch_orders(days=args.days)
    except Exception as e:
        logger.error(f"获取订单数据失败: {e}")
        logger.info("尝试切换至CSV模式...")
        config.data_mode = "csv"
        from shared.data_source import CSVDataSource
        ds = CSVDataSource(config)
        try:
            orders = ds.fetch_orders(days=args.days)
        except Exception as e2:
            logger.error(f"CSV模式也失败: {e2}")
            sys.exit(1)

    if not orders:
        logger.warning("没有订单数据，报告为空")
        return

    # 2. 保存为CSV供其他模块使用
    output_dir = args.output_dir or config.daily_exports_dir
    if output_dir:
        save_orders_to_csv(orders, output_dir)

    # 3. 计算指标
    stores = compute_store_summaries(orders)
    top_skus = compute_top_skus(orders)
    previous = load_yesterday_history()

    # 4. 生成报表
    report = generate_markdown_report(stores, top_skus, previous, args.days)
    today = datetime.now().strftime("%Y-%m-%d")
    report_name = f"daily_report_{today}.md"
    report_dir = Path(output_dir) if output_dir else PROJECT_ROOT / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / report_name
    report_path.write_text(report, encoding="utf-8")
    logger.info(f"报告已保存: {report_path}")

    # 打印到控制台
    print("\n" + report + "\n")

    # 5. 保存快照
    save_snapshot(stores, top_skus)

    # 6. 发送邮件
    if not args.no_email:
        subject = f"赛盒ERP销售{'周报' if args.days > 1 else '日报'} {today}"
        send_email(report, subject, config)

    logger.info("日报生成完成")


if __name__ == "__main__":
    main()
