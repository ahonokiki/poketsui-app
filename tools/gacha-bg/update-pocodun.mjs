// ポコダンの新しい動画（ポコダン情報局・ポコステ）のサムネイルを取って、背景用の小さな画像を pocodun/bg-auto/ に残す（history.json に追記）
// 取得元：公式YouTubeチャンネルのRSS（ログイン不要）。コラボやガチャの告知はここに出る（月に1本ほど）
// 使い方: node tools/gacha-bg/update-pocodun.mjs          … はじめて見る新しい動画だけ足す（GitHub Actions で毎日）
//         node tools/gacha-bg/update-pocodun.mjs 動画ID…  … 過去の動画を指定して足す（例: obKEmQN9YVg）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadHistory, saveHistory, saveThumb, fetchImage, safe, jstDate, UA } from './lib.mjs';
const DIR = 'pocodun/bg-auto';
const SEEN = 'tools/gacha-bg/pocodun-yt-seen.json'; // 取り込み開始のときにあった動画（背景には足さない）。アプリは読まない
const FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCiZhhbZ7zsF2yEs3Cbm-S9Q';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// 動画のタイトルから名前と種類を作る
//   【ポコダン情報局】｢無職転生｣コラボ情報を大公開！ → 無職転生（コラボ）
//   【ポコダン情報局】ポコロンアビス最新情報を大公開！ → ポコロンアビス最新情報   【ポコステ】12周年スペシャル！ → 12周年スペシャル
export function parseTitle(t) {
  const s = t.replace(/^【[^】]*】\s*/, '').trim();
  const q = s.match(/[｢「『"]\s*([^｣」』"]+?)\s*[｣」』"]/);
  const zoku = /続報/.test(s) ? ' 続報' : '';
  if (q && /コラボ/.test(s)) return { name: q[1].replace(/^#/, '').trim() + zoku, kind: 'コラボ' };
  const c = s.match(/^(.+?)\s*コラボ/); // 括弧なし：僕のヒーローアカデミア コラボ続報を大公開！
  if (c) return { name: c[1].replace(/#/g, '').trim() + zoku, kind: 'コラボ' };
  const name = s.replace(/(を)?大公開[！!]*$/, '').replace(/情報情報/, '情報').replace(/[！!]+$/, '').replace(/#/g, '').trim();
  return { name: name || s };
}

const hist = loadHistory(DIR), have = new Set(hist.map(x => x.id));
const want = process.argv.slice(2).filter(a => /^[\w-]{11}$/.test(a)); // 過去の動画を指定したとき
const first = !existsSync(SEEN);
let entries = [];
try {
  const r = await fetch(FEED, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('YouTubeのRSSを取得できません: ' + r.status);
  const xml = await r.text();
  entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
    const g = re => (m[1].match(re) || [])[1] || '';
    return { vid: g(/<yt:videoId>([^<]+)</), title: unesc(g(/<title>([^<]*)</)), date: jstDate(g(/<published>([^<]+)</)) };
  }).filter(e => e.vid && e.title);
  if (!entries.length) throw new Error('RSSに動画がありません');
} catch (e) { console.log('::warning::' + e.message); }

// はじめての1回は、いまある動画を「見た」として覚えるだけで足さない（過去の分は動画IDを指定したときだけ足す）
if (first && entries.length) {
  writeFileSync(SEEN, JSON.stringify(entries.map(e => e.vid), null, 0) + '\n');
  console.log(`取り込みを始めました（いまある動画 ${entries.length}本は足していません）`);
  if (!want.length) process.exit(0);
}
const seen = new Set(existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')).map(v => 'yt-' + v) : []);

let n = 0;
for (const e of entries) {
  const id = 'yt-' + e.vid;
  if (have.has(id) || (want.length ? !want.includes(e.vid) : seen.has(id))) continue;
  try { // 1本で失敗しても、ほかの動画と history.json の保存は続ける（失敗した分は次の日にもう一度）
    // サムネイル：大きいもの（黒い帯なし）→ 中くらい（黒い帯なし）の順に試す
    let raw = null;
    for (const q of ['maxresdefault', 'mqdefault']) { raw = await fetchImage(`https://i.ytimg.com/vi/${e.vid}/${q}.jpg`); if (raw) break; }
    await sleep(500);
    if (!raw) continue;
    const { name, kind } = parseTitle(e.title);
    const src = await saveThumb(DIR, `${e.date}_${safe(id)}.jpg`, raw);
    hist.push({ id, date: e.date, name, src, from: '公式YouTube', ...(kind ? { kind } : {}), url: 'https://www.youtube.com/watch?v=' + e.vid });
    console.log('追加', e.date, name, kind || ''); n++;
  } catch (err) { console.log('::warning::' + e.vid + ' ' + err.message); }
}
for (const v of want) if (!entries.some(e => e.vid === v)) console.log('RSSに無い動画です（最新15本だけ見られます）:', v);
console.log(saveHistory(DIR, hist) ? `history.json を更新（${n}件追加）` : '変更なし');
