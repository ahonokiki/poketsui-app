#!/bin/bash
# 定期の売れ筋集計をまとめて行う（ポケツイ→ピグパの順）。合言葉は RANKING_KEY で渡す（ここには書かない）
# 使い方: RANKING_KEY=… bash tools/routine.sh
# 各リポジトリ：main にそろえる → 集計 → data/ を commit → 作業ブランチに push。最後に RESULT/FAIL の行を出す
[ -n "${RANKING_KEY:-}" ] || { echo "FAIL all RANKING_KEY がありません"; exit 1; }
export NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
retry(){ local n=0 w=2; until "$@"; do n=$((n+1)); [ $n -ge 4 ] && return 1; sleep $w; w=$((w*2)); done; }
out=()
for pair in poketsui-app:claude/vigilant-pasteur-1ug721 piggparty-app:claude/stop-schedule; do
  repo=${pair%%:*}; br=${pair#*:}; dir=/home/user/$repo
  [ -d "$dir/.git" ] || { out+=("FAIL $repo フォルダがありません"); continue; }
  cd "$dir" || continue
  retry git fetch -q origin main && git checkout -q -B "$br" origin/main || { out+=("FAIL $repo mainにそろえられません"); continue; }
  log=$(${TRACK:-node tools/gametrade-track.mjs} 2>&1); code=$? # TRACK：試すときだけ別の命令に差しかえる
  sum=$(printf '%s\n' "$log" | grep -E '^一覧 ' | tail -1)
  if printf '%s' "$log" | grep -qE '一覧から出品を1件も読めませんでした|status 403|HTTP 403|VPN'; then out+=("FAIL $repo ゲームトレードにアクセスを断られました（403など）"); break; fi
  [ $code -eq 0 ] && [ -n "$sum" ] || { out+=("FAIL $repo 集計が失敗（$(printf '%s\n' "$log" | tail -1 | cut -c1-120)）"); continue; }
  git add data/gametrade-state.enc data/gametrade-ranking.enc data/gametrade-names.json 2>/dev/null
  if git diff --cached --quiet; then out+=("RESULT $repo nochange $sum"); continue; fi
  git commit -qm "売れ筋ランキングを更新（定期）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && retry git push -q -u origin "$br" || { out+=("FAIL $repo pushできません"); continue; }
  out+=("RESULT $repo pushed $sum")
done
printf '%s\n' "${out[@]}"
