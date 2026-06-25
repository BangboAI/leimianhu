# 赛盒ERP分析工具 - 部署指南

## 目录结构

saihe_erp/
├── shared/                    # 共享库（所有模块依赖）
│   ├── config.py              # 配置加载（环境变量 > config.json > 默认值）
│   ├── logger.py              # 统一日志（console + file）
│   ├── models.py              # 数据模型 + 汇率换算
│   └── data_source.py         # SOAP API 客户端 + CSV 降级
├── scripts/
│   ├── daily_report.py        # 模块1: 自动销售日报
│   ├── profit_recalc.py       # 模块2: 利润重算
│   ├── ad_analysis.py         # 模块4: 广告归因
│   └── product_strategy.py    # 模块5: 选品策略
├── dashboard/
│   └── app.py                 # 模块3: Streamlit 看板
├── config.example.json
├── .env.example
├── requirements.txt
├── .gitignore
└── DEPLOY.md

## 一、本地快速开始

1. 安装依赖: pip install -r requirements.txt
2. 复制配置: copy config.example.json config.json，填入赛盒账号密码
3. 测试日报: python scripts/daily_report.py --days 7
4. 启动看板: streamlit run dashboard/app.py，浏览器打开 http://localhost:8501

## 二、部署看板到服务器

### systemd + nginx（推荐，适用于有 Linux 服务器的团队）

1. 服务器安装依赖: apt install python3 python3-pip nginx
2. pip install -r requirements.txt
3. 上传代码到服务器 /opt/saihe_erp
4. 配置 systemd 服务:

。cat > /etc/systemd/system/saihe-dashboard.service << 'EOF。'
[Unit]
Description=Saihe ERP Dashboard
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/saihe_erp
EnvironmentFile=/opt/saihe_erp/.env
ExecStart=/usr/bin/python3 -m streamlit run dashboard/app.py --server.port 8501 --server.headless true
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
。EOF。

5. nginx 反向代理，配置域名 erp.huaangal.com
6. 建议用 certbot 配置 HTTPS

### Streamlit Community Cloud（免费，无需服务器）

1. 推代码到 GitHub 私有仓库
2. 登录 streamlit.io/cloud 连接仓库
3. 选择 dashboard/app.py 部署
4. 在 Secrets 中设 password

## 三、赛盒API配置

方式1: 编辑 config.json
方式2: 环境变量（推荐服务器部署）
  export SAIHE_USERNAME=leimianhu@loeldeal.com
  export SAIHE_PASSWORD=your_password

## 四、定时任务

### Windows 计划任务（每日9点发日报）

 = New-ScheduledTaskAction -Execute "python" -Argument "C:\saihe_erp\scripts\daily_report.py"
 = New-ScheduledTaskTrigger -Daily -At 09:00AM
Register-ScheduledTask -TaskName "赛盒ERP日报" -Action  -Trigger 

### Linux crontab

0 9 * * * cd /opt/saihe_erp && python scripts/daily_report.py
0 9 * * 1 cd /opt/saihe_erp && python scripts/daily_report.py --days 7
0 3 * * * cd /opt/saihe_erp && python scripts/daily_sync.py

## 五、CSV数据格式

详见各模块脚本开头的注释说明。

## 六、常见问题

Q: API连接失败？
A: 自动降级到CSV模式。设 data_mode: csv

Q: QQ邮箱发信失败？
A: 用授权码而非登录密码。QQ邮箱 -> 设置 -> 账户 -> POP3/SMTP

Q: 如何改看板密码？
A: 编辑 dashboard/.streamlit/secrets.toml 修改 password

Q: 看板数据不更新？
A: 先运行 daily_report.py 生成数据，看板5分钟自动刷新
