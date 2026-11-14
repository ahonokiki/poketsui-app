#!/bin/bash
# 定期の売れ筋集計をまとめて行う（ポケツイ→ピグパの順）。合言葉は RANKING_KEY で渡す（ここには書かない）
# 使い方: RANKING_KEY=… bash tools/routine.sh
# 各リポジトリ：main から別の作業フォルダ（git worktree）を作って集計 → data/ を commit → 作業ブランチに push。最後に RESULT/FAIL の行を出す
# 集計は作業フォルダと切り離して行うので、その間に作業フォルダで直しを commit しても定期のPRには混ざらない
# 作業ブランチは毎回 main から作り直すので、push は上書き（--force-with-lease：見たときから誰かが push していたら上書きしない）
[ -n "${RANKING_KEY:-}" ] || { echo "FAIL all RANKING_KEY がありません"; exit 1; }
export NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
retry(){ local n=0 w=2; until "$@"; do n=$((n+1)); [ $n -ge 4 ] && return 1; sleep $w; w=$((w*2)); done; }
B=${ROUTINE_BASE:-/home/user} T=${ROUTINE_TMP:-/tmp} # 試すときだけ別の場所に差しかえる
out=()
# 「main に混ぜたら data/ 以外が変わるか」で作業中かを見る（squash merge 済みや、main だけ進んだ分は作業ではない）
nowork(){ local t; t=$(git merge-tree --write-tree origin/main "$1" 2>/dev/null | head -1); [ -n "$t" ] && git diff --quiet origin/main "$t" -- . "${2:-:!data}"; }
# 定期以外の題名の commit（手で入れた data/ など）が、まだ main に入っていないか
handdata(){ git log --format=%s "origin/main..$1" | grep -qvE '^(売れ筋ランキング|売れ行き調べ)を更新（定期）$' && ! nowork "$1" data; }
# 副業のゲーム選びの売れ行き調べ（ポケツイの集計と同時に、別に動かす。記録は $T に書き、最後にポケツイの作業ブランチへ足す）
SPID=''; svin=$T/ms-in.enc; svout=$T/ms-out.enc; rm -f "$svout"
if git -C "$B/poketsui-app" fetch -q origin main 2>/dev/null && git -C "$B/poketsui-app" show origin/main:tools/market-survey.mjs > "$T/market-survey.mjs" 2>/dev/null; then
  git -C "$B/poketsui-app" show origin/main:data/market-survey.enc > "$svin" 2>/dev/null || : > "$svin"
  SURVEY_IN="$svin" SURVEY_OUT="$svout" node "$T/market-survey.mjs" > "$T/ms.log" 2>&1 & SPID=$!
fi
pwt='' # ポケツイの集計用の作業フォルダ（調べを最後に足すため残す）
for pair in poketsui-app:claude/vigilant-pasteur-1ug721 piggparty-app:claude/stop-schedule; do
  repo=${pair%%:*}; br=${pair#*:}; dir=$B/$repo; wt=$T/rt-$repo
  [ -d "$dir/.git" ] || { out+=("FAIL $repo フォルダがありません"); continue; }
  cd "$dir" || continue
  # 作業中の変更があるときは何もしない（作業ブランチを main に作り直すと、直しかけの物が消えるため）
  retry git fetch -q origin main || { out+=("FAIL $repo mainを取れません"); continue; }
  # origin に作業ブランチが無い（merge 後に消した）ときは、手元の古い追跡も消す（lease が古い sha で断られないように）
  git fetch -q origin "$br" 2>/dev/null || { git ls-remote --exit-code --heads origin "$br" >/dev/null 2>&1; [ $? -eq 2 ] && git update-ref -d "refs/remotes/origin/$br"; }
  ob=$(git rev-parse -q --verify "origin/$br" 2>/dev/null) # push の上書きは、ここで見た origin/$br のときだけ
  if [ -n "$(git status --porcelain --untracked-files=no -- . ':!data')" ] || ! nowork HEAD || { [ -n "$ob" ] && { ! nowork "$ob" || handdata "$ob"; }; }; then
    out+=("FAIL $repo 作業中の変更（data/ 以外）がまだ main に入っていないので、集計を止めました"); continue; fi
  # 前の回の書きかけ（時間切れなど）の data/ は捨ててから、作業フォルダも main にそろえる
  git restore -q --source=origin/main --staged --worktree -- data 2>/dev/null
  git checkout -q -B "$br" origin/main || { out+=("FAIL $repo mainにそろえられません"); continue; }
  start=$(git rev-parse HEAD)
  git worktree remove -f "$wt" 2>/dev/null; rm -rf "$wt"; git worktree prune
  git worktree add -q --detach "$wt" origin/main || { out+=("FAIL $repo 集計用の作業フォルダを作れません"); continue; }
  cd "$wt" || continue
  log=$(${TRACK:-node tools/gametrade-track.mjs} 2>&1); code=$? # TRACK：試すときだけ別の命令に差しかえる
  sum=$(printf '%s\n' "$log" | grep -E '^一覧 ' | tail -1)
  if printf '%s' "$log" | grep -qE '一覧から出品を1件も読めませんでした|status 403|HTTP 403|VPN'; then out+=("FAIL $repo ゲームトレードにアクセスを断られました（403など）"); break; fi
  # 失敗したときは、原因がわかるように、エラーの行（なければ最後の行）を出す
  why=$(printf '%s\n' "$log" | grep -v 'EnvHttpProxyAgent\|trace-warnings\|^Node.js v' | grep -m1 -E 'Error|error|ECONN|ETIMEDOUT|失敗|読め' ); [ -n "$why" ] || why=$(printf '%s\n' "$log" | grep -v '^\s*$' | grep -v '^Node.js v' | tail -1)
  [ $code -eq 0 ] && [ -n "$sum" ] || { out+=("FAIL $repo 集計が失敗（code $code: $(printf '%s' "$why" | cut -c1-200)）"); continue; }
  # ポコダンの記録（ポケツイのリポジトリにいっしょに入れる。失敗してもポケツイの集計は止めない）
  pd=''; if [ "$repo" = poketsui-app ] && [ -f tools/pocodun-track.mjs ]; then pl=$(${TRACK_PD:-node tools/pocodun-track.mjs} 2>&1); if [ $? -eq 0 ]; then pd=$(printf '%s\n' "$pl" | grep -E '^ポコダン ' | tail -1); else pd="ポコダンの記録は失敗（$(printf '%s\n' "$pl" | grep -v 'EnvHttpProxyAgent\|trace-warnings' | grep -v '^\s*$' | tail -1 | cut -c1-120)）"; fi; fi
  git add data/gametrade-state.enc data/gametrade-ranking.enc data/gametrade-names.json 2>/dev/null
  [ -f data/pocodun-state.enc ] && git add data/pocodun-state.enc
  if git diff --cached --quiet; then out+=("RESULT $repo nochange $sum"); [ -n "$pd" ] && out+=("RESULT pocodun $pd"); [ "$repo" = poketsui-app ] && pwt=$wt; continue; fi
  git commit -qm "売れ筋ランキングを更新（定期）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && retry git push -q --force-with-lease="$br:$ob" origin "HEAD:refs/heads/$br" || { out+=("FAIL $repo pushできません"); continue; }
  out+=("RESULT $repo pushed $sum"); [ -n "$pd" ] && out+=("RESULT pocodun $pd")
  [ "$repo" = poketsui-app ] && pwt=$wt # 調べはランキングを送ったあと、最後に足す
  # 作業フォルダがそろえた直後のまま（誰も commit していない）なら、push した物にそろえる
  new=$(git rev-parse HEAD); cd "$dir" && [ "$(git rev-parse HEAD)" = "$start" ] && [ -z "$(git status --porcelain --untracked-files=no)" ] && git checkout -q -B "$br" "$new" && git branch -q -u "origin/$br"
done
# 最後に売れ行き調べを待つ（時間つき。間に合わなければ調べだけ FAIL。ランキングはもう push 済み）
# ポケツイの集計が止まった回は、調べを入れる先が無いので待たずに止める
if [ -n "$SPID" ] && [ -z "$pwt" ]; then kill "$SPID" 2>/dev/null; out+=("FAIL survey ポケツイの集計が止まったので、調べの記録を入れられません"); SPID=''; fi
if [ -n "$SPID" ]; then
  lim=$(( ${SURVEY_WAIT_MIN:-105} * 60 )); while kill -0 "$SPID" 2>/dev/null && [ $SECONDS -lt $lim ]; do sleep 5; done
  if kill -0 "$SPID" 2>/dev/null; then kill "$SPID" 2>/dev/null; out+=("FAIL survey 売れ行き調べが時間内に終わりませんでした（ランキングは送り済み）")
  else wait "$SPID"; svl=$(grep -E '^調べ ' "$T/ms.log" | tail -1)
    if ! [ -s "$svout" ] || [ -z "$svl" ]; then out+=("FAIL survey 売れ行き調べが失敗（$(grep -v 'EnvHttpProxyAgent\|trace-warnings' "$T/ms.log" | tail -1 | cut -c1-150)）")
    elif [ -z "$pwt" ]; then out+=("FAIL survey ポケツイの集計が止まったので、調べの記録を入れられません")
    else br=claude/vigilant-pasteur-1ug721; cd "$pwt" && ob=$(git rev-parse -q --verify "origin/$br"); old=$(git rev-parse HEAD)
      # ポケツイの作業ブランチ（ランキングの commit の上）に足して送る
      if cp "$svout" data/market-survey.enc && git add data/market-survey.enc && ! git diff --cached --quiet && git commit -qm "売れ行き調べを更新（定期）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
         && retry git push -q --force-with-lease="$br:$ob" origin "HEAD:refs/heads/$br"; then out+=("RESULT survey $svl")
        # ランキングが nochange でも、調べを送ったので PR を作るよう pushed にする
        for i in "${!out[@]}"; do out[$i]=${out[$i]/#RESULT poketsui-app nochange/RESULT poketsui-app pushed}; done
        # 作業フォルダがランキングを送った直後のままなら、ここにもそろえる
        new=$(git rev-parse HEAD); cd "$B/poketsui-app" && [ "$(git rev-parse HEAD)" = "$old" ] && [ -z "$(git status --porcelain --untracked-files=no)" ] && git checkout -q -B "$br" "$new" && git branch -q -u "origin/$br"
      else out+=("FAIL survey 調べの記録を送れません"); fi; fi; fi
fi
for r in poketsui-app piggparty-app; do git -C "$B/$r" worktree remove -f "$T/rt-$r" 2>/dev/null; done
printf '%s\n' "${out[@]}"
