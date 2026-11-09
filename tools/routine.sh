#!/bin/bash
# 定期の売れ筋集計をまとめて行う（ポケツイ→ピグパの順）。合言葉は RANKING_KEY で渡す（ここには書かない）
# 使い方: RANKING_KEY=… bash tools/routine.sh
# 各リポジトリ：main にそろえる → 集計 → data/ を commit → 作業ブランチに push。最後に RESULT/FAIL の行を出す
# 作業ブランチは毎回 main から作り直すので、push は上書き（-f）。前回の分はもう main に入っている
[ -n "${RANKING_KEY:-}" ] || { echo "FAIL all RANKING_KEY がありません"; exit 1; }
export NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
retry(){ local n=0 w=2; until "$@"; do n=$((n+1)); [ $n -ge 4 ] && return 1; sleep $w; w=$((w*2)); done; }
out=()
for pair in poketsui-app:claude/vigilant-pasteur-1ug721 piggparty-app:claude/stop-schedule; do
  repo=${pair%%:*}; br=${pair#*:}; dir=/home/user/$repo
  [ -d "$dir/.git" ] || { out+=("FAIL $repo フォルダがありません"); continue; }
  cd "$dir" || continue
  # 作業中の変更があるときは何もしない（作業ブランチを main に作り直すと、直しかけの物が消えるため）
  retry git fetch -q origin main || { out+=("FAIL $repo mainを取れません"); continue; }
  git fetch -q origin "$br" 2>/dev/null
  # main だけが先に進んだ分（毎日の「アイテム名一覧を更新」など）は作業ではないので、分かれた所からの差（...）だけを見る
  if [ -n "$(git status --porcelain --untracked-files=no)" ] || [ -n "$(git diff --name-only origin/main...HEAD -- . ':!data' 2>/dev/null)" ] \
     || { git rev-parse -q --verify "origin/$br" >/dev/null && [ -n "$(git diff --name-only origin/main..."origin/$br" -- . ':!data')" ]; }; then
    out+=("FAIL $repo 作業中の変更（data/ 以外）がまだ main に入っていないので、集計を止めました"); continue; fi
  git checkout -q -B "$br" origin/main || { out+=("FAIL $repo mainにそろえられません"); continue; }
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
  if git diff --cached --quiet; then out+=("RESULT $repo nochange $sum"); [ -n "$pd" ] && out+=("RESULT pocodun $pd"); continue; fi
  git commit -qm "売れ筋ランキングを更新（定期）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && retry git push -q -f -u origin "$br" || { out+=("FAIL $repo pushできません"); continue; }
  out+=("RESULT $repo pushed $sum"); [ -n "$pd" ] && out+=("RESULT pocodun $pd")
done
printf '%s\n' "${out[@]}"
