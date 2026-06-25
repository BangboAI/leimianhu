@echo off
chcp 65001 >nul
REM ========================================
REM  赛盒ERP每日数据分析 - 定时运行脚本
REM  每天早上自动跑，结果推送到GitHub
REM  给BANGBOAI智能体消费
REM ========================================

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set SKILL_DIR=%USERPROFILE%\.codex\skills\saihe-erp-analyzer
set DATA_FILE=%SCRIPT_DIR%data\daily-report.json
set NODE=C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
set USER=leimianhu@loeldeal.com
set PASS=LOELcase3322

echo [%date% %time%] 开始分析赛盒ERP订单数据...

if not exist "%NODE%" (
    echo ❌ 找不到Node.js: %NODE%
    exit /b 1
)

if not exist "%SKILL_DIR%\scripts\analyze-orders.js" (
    echo ❌ 找不到分析脚本，尝试从仓库复制...
    if exist "%SCRIPT_DIR%skills\saihe-erp-analyzer\scripts\analyze-orders.js" (
        xcopy /E /I /Y "%SCRIPT_DIR%skills\saihe-erp-analyzer\*" "%SKILL_DIR%\"
    ) else (
        echo ❌ 分析脚本不存在
        exit /b 1
    )
)

echo [%date% %time%] 正在拉取订单数据...

"%NODE%" "%SKILL_DIR%\scripts\analyze-orders.js" --user %USER% --pass %PASS% --days 1 --format json > "%DATA_FILE%" 2> "%SCRIPT_DIR%data\error.log"

if %errorlevel% neq 0 (
    echo ❌ 分析失败
    type "%SCRIPT_DIR%data\error.log"
    exit /b 1
)

echo ✅ 分析完成，已保存到 %DATA_FILE%

echo [%date% %time%] 正在推送到GitHub...
cd /d "%SCRIPT_DIR%"

REM 检查json文件是否有效
findstr "total_usd_revenue" "%DATA_FILE%" >nul
if %errorlevel% neq 0 (
    echo ❌ JSON文件无效
    exit /b 1
)

git add data/daily-report.json
git commit -m "daily: 赛盒ERP分析报告 %date%"
set HTTPS_PROXY=
set HTTP_PROXY=
git push origin main 2>> "%SCRIPT_DIR%data\push-error.log"

if %errorlevel% neq 0 (
    echo ⚠️ Push可能失败，检查日志
    type "%SCRIPT_DIR%data\push-error.log"
) else (
    echo ✅ 已推送到GitHub
)

echo [%date% %time%] 完成
