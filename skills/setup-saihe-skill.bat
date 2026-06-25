@echo off
REM 赛盒ERP数据分析 Skill 安装脚本
REM 在另一台电脑上运行此脚本，将skill安装到Codex

set SKILL_SRC=%~dp0saihe-erp-analyzer
set SKILL_DST=%USERPROFILE%\.codex\skills\saihe-erp-analyzer

if not exist "%SKILL_DST%" mkdir "%SKILL_DST%" 2>nul

xcopy /E /I /Y "%SKILL_SRC%\*" "%SKILL_DST%\"
echo.
echo ✅ 赛盒ERP分析Skill已安装到: %SKILL_DST%
echo.
echo 打开Codex后说: "帮我分析赛盒ERP订单数据"
echo.
pause
