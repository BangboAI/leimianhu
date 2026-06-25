# 赛盒ERP每日分析 - 定时运行脚本 (PowerShell)
# 每天早上自动跑，结果推送到GitHub供BANGBOAI读取

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$SkillDir = "$env:USERPROFILE\.codex\skills\saihe-erp-analyzer"
$DataFile = "$ScriptDir\data\daily-report.json"
$ErrorLog = "$ScriptDir\data\error.log"
$PushLog  = "$ScriptDir\data\push-error.log"
$NodeExe  = "C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$AnalyzeScript = "$SkillDir\scripts\analyze-orders.js"

$User = "leimianhu@loeldeal.com"
$Pass = "LOELcase3322"

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 赛盒ERP每日数据分析开始..."

# Check Node.js
if (-not (Test-Path $NodeExe)) {
    Write-Host "[ERROR] 找不到Node.js: $NodeExe"
    exit 1
}

# Copy skill if needed
if (-not (Test-Path $AnalyzeScript)) {
    $SrcSkill = "$ScriptDir\skills\saihe-erp-analyzer"
    if (Test-Path $SrcSkill) {
        Copy-Item -Path "$SrcSkill\*" -Destination $SkillDir -Recurse -Force
    } else {
        Write-Host "[ERROR] 找不到分析脚本"
        exit 1
    }
}

# Run analysis
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 拉取订单数据..."
$result = & $NodeExe $AnalyzeScript --user $User --pass $Pass --days 1 --format json 2>$ErrorLog

if ($LASTEXITCODE -ne 0 -or -not $result) {
    Write-Host "[ERROR] 分析失败"
    if (Test-Path $ErrorLog) { Get-Content $ErrorLog }
    exit 1
}

# Save data
$result | Out-File -FilePath $DataFile -Encoding utf8
Write-Host "[OK] 分析完成: $($result | ConvertFrom-Json | Select -Expand total_items) 条订单"

# Validate JSON
try { $null = $result | ConvertFrom-Json } catch {
    Write-Host "[ERROR] JSON无效"
    exit 1
}

# Push to GitHub
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 推送到GitHub..."
Push-Location $ScriptDir
git add data/daily-report.json 2>&1 | Out-Null

# Clear proxy for git
$env:HTTPS_PROXY = $null
$env:HTTP_PROXY = $null

$commitMsg = "daily: 赛盒ERP分析报告 $(Get-Date -Format 'yyyy-MM-dd')"
git -c http.proxy= -c https.proxy= commit -m $commitMsg 2>&1 | Out-Null
git -c http.proxy= -c https.proxy= push origin main 2>> $PushLog

if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Push可能有延迟，数据已保存在本地"
    if (Test-Path $PushLog) { Get-Content $PushLog }
} else {
    Write-Host "[OK] 已推送到GitHub，Vercel自动部署中..."
}

Pop-Location
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 完成"
