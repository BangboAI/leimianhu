"""
?????????? (Streamlit)

??:
  streamlit run dashboard/app.py
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta

_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))

import streamlit as st
import pandas as pd
import plotly.express as px

from shared.config import load_config
from shared.data_source import create_data_source
from shared.logger import setup_logger

logger = setup_logger("dashboard")

st.set_page_config(page_title="??ERP????", page_icon="chart_with_upwards_trend", layout="wide")

def check_password():
    if "authenticated" not in st.session_state:
        st.session_state.authenticated = False
    if st.session_state.authenticated:
        return True
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.markdown("## Lock ??ERP????")
        pwd = st.text_input("???????", type="password")
        if pwd == "saihe123":
            st.session_state.authenticated = True
            st.rerun()
        elif pwd:
            st.error("????")
    return False

if not check_password():
    st.stop()

st.title("Chart ??ERP????")
st.caption(f"????: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | ????5??")

@st.cache_data(ttl=300)
def load_data():
    config = load_config()
    ds = create_data_source(config)
    orders = ds.fetch_orders(days=90)
    inventory = ds.fetch_inventory()
    rows = []
    for order in orders:
        for item in order.items:
            rows.append({"store": order.store, "sku": item.sku, "client_sku": item.client_sku, "title": item.title, "qty": item.qty, "revenue_usd": item.revenue_usd, "cost": item.cost_total})
    df_orders = pd.DataFrame(rows) if rows else pd.DataFrame()
    df_inv = pd.DataFrame([{"sku": i.sku, "qty": i.quantity, "safety_stock": i.safety_stock} for i in inventory]) if inventory else pd.DataFrame()
    return df_orders, df_inv

df_orders, df_inv = load_data()

# KPI
col1, col2, col3, col4 = st.columns(4)
rev = df_orders["revenue_usd"].sum() if not df_orders.empty else 0
cnt = len(df_orders)
col1.metric("90????", f"${rev:,.0f}")
col2.metric("???", f"{cnt:,}")
col3.metric("???", df_orders["store"].nunique() if not df_orders.empty else 0)
low = len(df_inv[df_inv["qty"] < df_inv["safety_stock"]]) if not df_inv.empty else 0
col4.metric("???SKU", low)

# ?????
st.subheader("Store ??????")
if not df_orders.empty:
    ss = df_orders.groupby("store")["revenue_usd"].sum().reset_index().sort_values("revenue_usd", ascending=False).head(15)
    fig = px.bar(ss, x="store", y="revenue_usd", color="revenue_usd", text_auto=".0s")
    fig.update_layout(height=400, xaxis_tickangle=-45)
    st.plotly_chart(fig, use_container_width=True)

# TOP10 SKU
st.subheader("Trophy ?? Top 10")
if not df_orders.empty:
    top = df_orders.groupby(["sku", "client_sku", "title"]).agg(sales=("revenue_usd", "sum"), qty=("qty", "sum")).reset_index().sort_values("sales", ascending=False).head(10)
    top["title_short"] = top["title"].str[:40]
    top["sales_fmt"] = top["sales"].apply(lambda x: f"${x:.0f}")
    st.dataframe(top[["client_sku", "title_short", "qty", "sales_fmt"]], use_container_width=True, height=400)

# ???
st.subheader("Warning ?????")
if not df_inv.empty:
    low_df = df_inv[(df_inv["qty"] < df_inv["safety_stock"]) & (df_inv["safety_stock"] > 0)].sort_values("qty")
    if not low_df.empty:
        st.dataframe(low_df, use_container_width=True)
    else:
        st.success("Check ?????SKU")

if st.button("Refresh ????"):
    st.cache_data.clear()
    st.rerun()
