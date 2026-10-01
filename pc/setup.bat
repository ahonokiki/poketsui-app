@echo off
chcp 65001 >nul
rem 売れ筋ランキングの集計を、このパソコンで毎日自動で動かすための準備（最初に1回だけ実行）
rem ゲームトレードは GitHub などのデータセンターからのアクセスを制限しているため、家庭のパソコンから集計する
set "DIR=%USERPROFILE%\gametrade-ranking"
where git >nul 2>&1 || (echo Git が入っていません。https://git-scm.com/download/win から入れてから、もう一度実行してください。& pause & exit /b 1)
where node >nul 2>&1 || (echo Node.js が入っていません。https://nodejs.org/ja から「LTS」を入れてから、もう一度実行してください。& pause & exit /b 1)
if not exist "%DIR%" mkdir "%DIR%"
cd /d "%DIR%"
if not exist poketsui-app git clone https://github.com/ahonokiki/poketsui-app.git
if not exist piggparty-app git clone https://github.com/ahonokiki/piggparty-app.git
for %%R in (poketsui-app piggparty-app) do (
  git -C %%R config user.name "ahonokiki"
  git -C %%R config user.email "ahonokiki@users.noreply.github.com"
)
copy /y "%DIR%\poketsui-app\pc\collect.bat" "%DIR%\collect.bat" >nul
if not exist "%DIR%\key.txt" (
  set /p "KEY=売れ筋ランキングの合言葉を入れて Enter: "
  call > "%DIR%\key.txt" echo %%KEY%%
)
rem 毎日 3:47 と 15:47 に動かす。その時刻にパソコンが止まっていたら、次に起動したときに動かす
powershell -NoProfile -Command "$a=New-ScheduledTaskAction -Execute '%DIR%\collect.bat'; $t=@((New-ScheduledTaskTrigger -Daily -At 3:47),(New-ScheduledTaskTrigger -Daily -At 15:47)); $s=New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 2); Register-ScheduledTask -TaskName 'GametradeRanking' -Action $a -Trigger $t -Settings $s -Force | Out-Null"
echo.
echo 毎日 3:47 と 15:47 に自動で集計するように登録しました。
echo 続けて1回目の集計をします（20〜40分ほど）。GitHub のログイン画面が出たらログインしてください。
call "%DIR%\collect.bat"
echo.
echo 終わりました。結果は %DIR%\log.txt に記録されています。
pause
