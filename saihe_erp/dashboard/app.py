"""
模块三：实时销售看板 (Streamlit)
启动: streamlit run dashboard/app.py --server.port 8501
"""
import sys, json, os
from pathlib import Path; from datetime import datetime, timedelta
_root = Path(__file__).resolve().parent.parent; sys.path.insert(0, str(_root))
import streamlit as st; import pandas as pd; import plotly.express as px
from shared.config import load_config; from shared.logger import setup_logger
logger = setup_logger("dashboard")

st.set_page_config(page_title="赛盒ERP销售看板", layout="wide")

# --- 看板访问密码 ---
if "authed" not in st.session_state: st.session_state.authed = False
if not st.session_state.authed:
    c1,c2,c3 = st.columns([1,2,1])
    with c2:
        st.markdown("## 赛盒ERP销售看板")
        pwd = st.text_input("请输入看板密码", type="password")
        if pwd == "saihe123": st.session_state.authed = True; st.rerun()
        elif pwd: st.error("密码错误")
    st.stop()

# --- 检查/配置赛盒账号 ---
config = load_config()
has_creds = bool(config.username and config.password)

if not has_creds and "saihe_user" not in st.session_state:
    st.title("赛盒ERP销售看板")
    st.info("请先配置赛盒ERP账号，数据将从API自动拉取")
    with st.form("config_form"):
        col1, col2 = st.columns(2)
        with col1: user = st.text_input("赛盒登录邮箱", value="leimianhu@loeldeal.com")
        with col2: pwd = st.text_input("赛盒登录密码", type="password")
        host = st.text_input("API主机(默认即可)", value="gg16.irobotbox.com")
        cid = st.text_input("供应商号(默认即可)", value="1502")
        submitted = st.form_submit_button("连接并拉取数据")
        if submitted:
            if user and pwd:
                st.session_state.saihe_user = user
                st.session_state.saihe_pass = pwd
                st.session_state.saihe_host = host
                st.session_state.saihe_cid = cid
                # 保存到 config.json
                cfg = {"username": user, "password": pwd,
                       "api_host": host, "customer_id": cid}
                with open(str(_root / "config.json"), "w", encoding="utf-8") as f:
                    json.dump(cfg, f, ensure_ascii=False, indent=2)
                st.rerun()
            else:
                st.error("请填写邮箱和密码")
    st.stop()

# 载入配置（从session或文件）
if has_creds:
    user, passwd = config.username, config.password
    api_host, cid = config.api_host, config.customer_id
else:
    user = st.session_state.saihe_user
    passwd = st.session_state.saihe_pass
    api_host = st.session_state.get("saihe_host", "gg16.irobotbox.com")
    cid = st.session_state.get("saihe_cid", "1502")
    # 临时替换配置
    config.username = user; config.password = passwd
    config.api_host = api_host; config.customer_id = cid

# --- 拉取数据 ---
st.title("赛盒ERP销售看板")
st.caption(f"账号: {user} | 最后更新: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

try:
    from shared.data_source import SaiheAPIClient
    ds = SaiheAPIClient(config)
    with st.spinner("正在从赛盒API拉取数据..."):
        orders = ds.fetch_orders(days=90)
    if not orders:
        st.warning("API返回0条订单，请检查账号权限或时间范围")
        st.stop()
    st.success(f"成功拉取 {len(orders)} 条订单")
except Exception as e:
    st.error(f"API连接失败: {str(e)[:150]}")
    st.info("请刷新页面重新输入账号密码")
    st.stop()

# --- 数据加工 ---
rows = []
for o in orders:
    for i in o.items:
        rows.append({"store":o.store,"sku":i.sku,"client_sku":i.client_sku,
            "title":i.title,"qty":i.qty,"revenue_usd":i.revenue_usd,"cost":i.cost_total})
df = pd.DataFrame(rows) if rows else pd.DataFrame()

# --- KPI ---
col1,col2,col3,col4 = st.columns(4)
rev = df["revenue_usd"].sum() if not df.empty else 0
col1.metric("90天销售额", f"${rev:,.0f}")
col2.metric("订单行", f"{len(df):,}")
col3.metric("店铺数", df["store"].nunique() if not df.empty else 0)
col4.metric("不同SKU数", df["sku"].nunique() if not df.empty else 0)

# --- 店铺柱状图 ---
st.subheader("各店铺销售额")
if not df.empty:
    ss = df.groupby("store")["revenue_usd"].sum().reset_index().sort_values("revenue_usd",ascending=False).head(15)
    fig = px.bar(ss,x="store",y="revenue_usd",color="revenue_usd",text_auto=".0s")
    fig.update_layout(height=400,xaxis_tickangle=-45)
    st.plotly_chart(fig,use_container_width=True)

# --- Top 10 ---
st.subheader("销量Top 10")
if not df.empty:
    top = df.groupby(["sku","client_sku","title"]).agg(
        sales=("revenue_usd","sum"), qty=("qty","sum")
    ).reset_index().sort_values("sales",ascending=False).head(10)
    top["标题"] = top["title"].str[:40]
    top["销售额"] = top["sales"].apply(lambda x:f"${x:.0f}")
    st.dataframe(top[["client_sku","标题","qty","销售额"]],use_container_width=True,height=400)

# --- 底部 ---
st.divider()
if st.button("刷新数据"): st.cache_data.clear(); st.rerun()
if st.button("更换账号"):
    for k in ["authed","saihe_user","saihe_pass","saihe_host","saihe_cid"]:
        st.session_state.pop(k,None)
    st.rerun()