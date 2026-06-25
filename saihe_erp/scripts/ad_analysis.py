"""
模块四：广告归因与真实 ACOS 计算

用法:
  python scripts/ad_analysis.py
  python scripts/ad_analysis.py --csv-dir ./data
  python scripts/ad_analysis.py --no-plot

输入:
  - orders.csv: 订单明细（含 is_ad_order 标记）
  - ads.csv: 广告花费数据
输出:
  - ad_acos_report.csv: ACOS分析表
  - 散点图 (可选)
"""

import argparse
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))

from shared.config import load_config, PROJECT_ROOT
from shared.logger import setup_logger
from shared.data_source import CSVDataSource

logger = setup_logger("ad_analysis")


def load_orders_csv(csv_path: str) -> list[dict]:
    """加载订单CSV"""
    p = Path(csv_path)
    if not p.exists():
        logger.error(f"订单文件不存在: {csv_path}")
        sys.exit(1)
    import csv
    with open(p, "r", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def load_ads_csv(csv_path: str) -> list[dict]:
    """加载广告CSV"""
    p = Path(csv_path)
    if not p.exists():
        logger.warning(f"广告文件不存在: {csv_path}，将使用空数据")
        return []
    import csv
    with open(p, "r", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def compute_acos(orders: list[dict], ads: list[dict]) -> list[dict]:
    """按SKU聚合计算名义ACOS和真实ACOS"""
    # 按SKU聚合订单
    sku_orders: dict[str, dict] = defaultdict(lambda: {
        "sku": "", "total_qty": 0, "total_sales": 0.0,
        "ad_qty": 0, "organic_qty": 0,
        "ad_sales": 0.0, "organic_sales": 0.0,
        "refund_amount": 0.0, "ad_spend": 0.0,
        "impressions": 0, "clicks": 0,
    })

    for row in orders:
        sku = row.get("SKU") or row.get("sku") or ""
        if not sku:
            continue

        sales = float(row.get("销售额") or row.get("sales") or row.get("total_price") or 0)
        qty = int(row.get("数量") or row.get("qty") or row.get("product_num") or 0)
        is_ad = int(row.get("is_ad_order") or row.get("is_ad", "0")) == 1
        refund = float(row.get("退款金额") or row.get("refund") or row.get("refund_amount", 0))

        d = sku_orders[sku]
        d["sku"] = sku
        d["total_sales"] += sales
        d["total_qty"] += qty
        d["refund_amount"] += refund

        if is_ad:
            d["ad_qty"] += qty
            d["ad_sales"] += sales
        else:
            d["organic_qty"] += qty
            d["organic_sales"] += sales

    # 按SKU聚合广告花费
    for row in ads:
        sku = row.get("SKU") or row.get("sku") or ""
        if not sku or sku not in sku_orders:
            continue
        spend = float(row.get("广告花费") or row.get("ad_spend") or 0)
        impressions = int(row.get("展示量") or row.get("impressions", 0))
        clicks = int(row.get("点击量") or row.get("clicks", 0))

        d = sku_orders[sku]
        d["ad_spend"] += spend
        d["impressions"] += impressions
        d["clicks"] += clicks

    # 计算ACOS
    results = []
    for sku, d in sku_orders.items():
        nominal_acos = d["ad_spend"] / d["ad_sales"] * 100 if d["ad_sales"] > 0 else 0.0
        real_ad_sales = d["ad_sales"] - d["refund_amount"] * (
            d["ad_sales"] / d["total_sales"] if d["total_sales"] > 0 else 0
        )
        real_acos = d["ad_spend"] / real_ad_sales * 100 if real_ad_sales > 0 else 0.0

        results.append({
            "SKU": sku,
            "自然单量": d["organic_qty"],
            "广告单量": d["ad_qty"],
            "总单量": d["total_qty"],
            "自然销售额": round(d["organic_sales"], 2),
            "广告销售额": round(d["ad_sales"], 2),
            "总销售额": round(d["total_sales"], 2),
            "退款金额": round(d["refund_amount"], 2),
            "广告花费": round(d["ad_spend"], 2),
            "展示量": d["impressions"],
            "点击量": d["clicks"],
            "名义ACOS": round(nominal_acos, 2),
            "真实ACOS": round(real_acos, 2),
        })

    results.sort(key=lambda x: x["真实ACOS"], reverse=True)
    return results


def generate_plot(results: list[dict], output_path: str):
    """生成散点图"""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        logger.warning("matplotlib 未安装，跳过图表生成")
        return

    # 只展示广告花费 > $10 的SKU
    filtered = [r for r in results if r["广告花费"] > 10]
    if not filtered:
        logger.info("没有符合条件的SKU生成图表")
        return

    fig, ax = plt.subplots(figsize=(14, 8))

    x = [r["广告花费"] for r in filtered]
    y = [r["真实ACOS"] for r in filtered]
    sizes = [min(r["广告单量"] * 15, 800) + 30 for r in filtered]
    colors = plt.cm.viridis(
        [r["真实ACOS"] / max(y) if max(y) > 0 else 0 for r in filtered]
    )

    scatter = ax.scatter(x, y, s=sizes, c=colors, alpha=0.7, edgecolors="w", linewidth=0.5)

    # 标注前5高ACOS的SKU
    top5 = sorted(filtered, key=lambda r: r["真实ACOS"], reverse=True)[:5]
    for r in top5:
        ax.annotate(
            r["SKU"][:15],
            (r["广告花费"], r["真实ACOS"]),
            fontsize=8, alpha=0.8,
            xytext=(5, 5), textcoords="offset points",
        )

    ax.set_xlabel("广告花费 (USD)")
    ax.set_ylabel("真实 ACOS (%)")
    ax.set_title("广告花费 vs 真实 ACOS")
    ax.axhline(y=30, color="red", linestyle="--", alpha=0.5, label="ACOS 30% 警戒线")
    ax.legend()
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info(f"散点图已保存: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="赛盒ERP广告归因分析")
    parser.add_argument("--csv-dir", type=str, help="CSV数据目录")
    parser.add_argument("--config", type=str, help="配置文件路径")
    parser.add_argument("--output", type=str, default=None, help="输出文件路径")
    parser.add_argument("--no-plot", action="store_true", help="不生成散点图")
    args = parser.parse_args()

    config = load_config(args.config)
    if args.csv_dir:
        config.csv_dir = args.csv_dir
        config.resolve_csv_paths()
    config.resolve_csv_paths()

    logger.info("广告归因分析开始")

    orders = load_orders_csv(config.orders_csv)
    ads = load_ads_csv(config.ads_csv)

    logger.info(f"订单: {len(orders)} 条 | 广告: {len(ads)} 条")

    results = compute_acos(orders, ads)

    # 输出CSV报告
    output_dir = PROJECT_ROOT / "reports"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = args.output or str(output_dir / f"ad_acos_report_{datetime.now().strftime('%Y-%m-%d')}.csv")

    import csv
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        if results:
            writer = csv.DictWriter(f, fieldnames=results[0].keys())
            writer.writeheader()
            writer.writerows(results)
    logger.info(f"报告已保存: {output_path}")

    # 打印TOP10
    print("\n=== 广告归因 TOP 10 (按真实ACOS降序) ===")
    print(f"{'SKU':<20} {'总单量':>8} {'广告单量':>8} {'广告花费':>10} {'名义ACOS':>10} {'真实ACOS':>10}")
    print("-" * 66)
    for r in results[:10]:
        sku = r["SKU"][:18]
        print(f"{sku:<20} {r['总单量']:>8} {r['广告单量']:>8} "
              f"${r['广告花费']:>7.2f} {r['名义ACOS']:>9.1f}% {r['真实ACOS']:>9.1f}%")

    print(f"\n共 {len(results)} 个SKU有广告数据")

    # 生成图表
    if not args.no_plot:
        plot_path = str(output_path.replace(".csv", ".png"))
        generate_plot(results, plot_path)

    logger.info("广告归因分析完成")


if __name__ == "__main__":
    main()
