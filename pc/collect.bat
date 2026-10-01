@echo off
chcp 65001 >nul
rem 売れ筋ランキングの集計（ポケツイ・ピグパ）。setup.bat が %USERPROFILE%\gametrade-ranking に置いて、毎日自動で動かす
set "DIR=%~dp0"
set /p RANKING_KEY=<"%DIR%key.txt"
>> "%DIR%log.txt" echo ==== %date% %time%
for %%R in (poketsui-app piggparty-app) do call :one %%R
exit /b
:one
cd /d "%DIR%%1"
git pull -q --rebase >> "%DIR%log.txt" 2>&1
>> "%DIR%log.txt" echo [%1]
node tools\gametrade-track.mjs >> "%DIR%log.txt" 2>&1
git add data
git diff --cached --quiet || (git commit -q -m "売れ筋ランキングを更新（パソコンから）" && git pull -q --rebase && git push -q) >> "%DIR%log.txt" 2>&1
exit /b
