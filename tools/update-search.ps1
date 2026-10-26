# 站內搜尋：抓筆記本（class.kh.edu.tw/19061）的新文章、重建索引，推回 vi-tools 的 master
# 筆記本擋國外連線，GitHub Actions 抓不到，所以在這台電腦上跑：
#   每週由「工作排程器」自動跑一次（工作名稱：vi-tools 站內搜尋更新）；剛發了新文章想馬上搜得到，直接執行這個檔
#   powershell -ExecutionPolicy Bypass -File update-search.ps1
# 用自己的一份 repo（%LOCALAPPDATA%\vi-tools-search\repo），不動 E:\Project 底下開發用的資料夾
# 需要：git（已登入 GitHub，可以推 hurthuang/vi-tools）、Node.js 18 以上
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8   # node、git 的輸出是 UTF-8
# 外部指令的輸出（含錯誤訊息）也寫進紀錄；$LASTEXITCODE 照樣是那個指令的結果
function Run([string]$c) { cmd /c "$c 2>&1" | ForEach-Object { Write-Output "  $_" } }
$base = Join-Path $env:LOCALAPPDATA 'vi-tools-search'
$repo = Join-Path $base 'repo'
$log = Join-Path $base 'update.log'
New-Item -ItemType Directory -Force $base | Out-Null
Start-Transcript -Path $log -Append | Out-Null
try {
  Write-Output "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  if (-not (Test-Path (Join-Path $repo '.git'))) {
    Run "git clone --depth 1 --branch master https://github.com/hurthuang/vi-tools.git ""$repo"""
    if ($LASTEXITCODE) { throw 'git clone 失敗' }
  }
  Set-Location $repo
  Run 'git fetch --depth 1 origin master'; if ($LASTEXITCODE) { throw 'git fetch 失敗' }
  git reset --hard origin/master | Out-Null

  Run 'node tools/build-search.mjs --crawl'
  if ($LASTEXITCODE) { throw '抓筆記本失敗' }

  git add data/notes.json search-index.json
  git diff --cached --quiet
  if (-not $LASTEXITCODE) { Write-Output '沒有新文章或更新'; return }
  git commit -q -m 'chore: 更新站內搜尋索引（筆記本）'
  $keep = Join-Path $base 'notes.json'
  for ($i = 1; $i -le 3; $i++) {
    Run 'git push origin HEAD:master'
    if (-not $LASTEXITCODE) { Write-Output '已推上 GitHub，網站幾分鐘後更新'; return }
    # master 在這段時間有別的更新：留著抓好的 notes.json，換成最新的 master 再重建一次
    Copy-Item data/notes.json $keep -Force
    git fetch --depth 1 origin master; git reset --hard origin/master | Out-Null
    Copy-Item $keep data/notes.json -Force
    node tools/build-search.mjs; git add data/notes.json search-index.json
    git commit -q -m 'chore: 更新站內搜尋索引（筆記本）'
  }
  throw 'git push 失敗'
} catch {
  Write-Output "錯誤：$_"
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
