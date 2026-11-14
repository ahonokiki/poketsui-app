// ポケツイの新しいガチャの告知画像を取って、背景用の小さな画像を bg-auto/ に残す（history.json に追記）
// 取得元：公式サイトのお知らせ一覧（https://www.pokecolotwin.jp/info-list/）が使っている API。壁紙と同じ所
// 使い方: node tools/gacha-bg/update-poketsui.mjs   GitHub Actions で毎日実行（.github/workflows/gacha-bg.yml）
import { readFileSync, existsSync } from 'node:fs';
import { loadHistory, saveHistory, saveThumb, fetchImage, safe, jstDate, UA } from './lib.mjs';
const DIR = 'bg-auto';
const API = 'https://pokecolotwin.wpcomstaging.com/wp-json/wp/v2/official-site-news';
const KINDS = ['ガチャ', 'MIX', '招待限定']; // 背景に使うお知らせの種類（タイトル先頭の【…】）。福袋・ChoiceBag も使うなら足す
const MAX = 20; // 1回に足す数の上限（はじめの1回で過去の分をさかのぼるとき用）
const sleep = ms => new Promise(r => setTimeout(r, ms));

const hist = loadHistory(DIR), have = new Set(hist.map(x => x.id));
const first = !hist.some(x => x.from === '公式お知らせ');
let news = null;
try {
  // ふだんは直近12件（毎日見るので取りこぼさない）。はじめの1回だけ40件さかのぼる
  const r = await fetch(`${API}?per_page=${first ? 40 : 12}&order=desc`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('お知らせを取得できません: ' + r.status);
  news = await r.json();
  if (!Array.isArray(news)) throw new Error('お知らせの形が違います');
} catch (e) { console.log('::warning::' + e.message); }

const add = [];
if (news) {
  const title = x => (typeof x.title === 'object' ? x.title.rendered : x.title) || '';
  for (const x of news) {
    const m = title(x).trim().match(/^【([^】]+)】\s*(.+?)\s*(登場)?\s*$/);
    if (!m || !KINDS.includes(m[1])) continue;
    const id = 'pt-' + x.id; if (have.has(id)) continue;
    // 告知画像：thumbnail（なければ本文の最初の画像）
    const url = (typeof x.thumbnail === 'string' && x.thumbnail) || (String(x.content || '').match(/<img[^>]+src="([^"]+)"/) || [])[1];
    if (!url) { console.log('画像なし', title(x)); continue; }
    add.push({ id, date: jstDate(x.created_at || x.date), name: m[2].trim(), kind: m[1], url });
  }
} else if (hist.length === 0 && existsSync('wallpaper.json')) {
  // お知らせが取れず、履歴がまだ空のときだけの代わり：その月の公式壁紙を残す（一時的な失敗で壁紙が履歴に混ざらないように）
  const w = JSON.parse(readFileSync('wallpaper.json', 'utf8')), ym = w.year_month || new Date().toISOString().slice(0, 7);
  const id = 'wp-' + ym;
  if (!have.has(id) && w.image && existsSync(w.image)) add.push({ id, date: ym + '-01', name: (w.title || ym + 'の壁紙').trim(), kind: '壁紙', file: w.image, from: '壁紙' });
}

let n = 0;
for (const a of add.slice(0, MAX)) {
  const raw = a.file ? readFileSync(a.file) : await fetchImage(a.url); if (!a.file) await sleep(500);
  if (!raw) continue;
  const src = await saveThumb(DIR, `${a.date}_${safe(a.id)}.jpg`, raw);
  hist.push({ id: a.id, date: a.date, name: a.name, src, from: a.from || '公式お知らせ', kind: a.kind, ...(a.url ? { url: a.url } : {}) });
  console.log('追加', a.date, a.kind, a.name); n++;
}
console.log(saveHistory(DIR, hist) ? `history.json を更新（${n}件追加）` : '変更なし');
