// ポケツイのアイテム名一覧 items.json を作る
// 取得元：リヴリー・ポケコロゲームクラブ（https://bon-cafe.jp/category/pokecolotwin/）のガチャごとのアイテム一覧記事
// 公式お知らせは本文が画像だけでアイテム名が文字になっていないため使えない
// 使い方: node tools/build-items.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const BASE = 'https://bon-cafe.jp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async url => { const r = await fetch(url, { redirect: 'follow' }); return r.ok ? r.text() : null; };
// 1) カテゴリの一覧ページから記事のURLを集める
const posts = new Set();
for (let page = 1; page < 100; page++) {
  const h = await get(page === 1 ? `${BASE}/category/pokecolotwin/` : `${BASE}/category/pokecolotwin/page/${page}/`);
  if (!h) break;
  const found = [...h.matchAll(/https:\/\/bon-cafe\.jp\/pokecolotwin\/\d+\//g)].map(m => m[0]);
  if (!found.length) break;
  found.forEach(u => posts.add(u)); await sleep(500);
}
// 2) 各記事の【アイテム名】レア度 を拾う
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
const names = new Set(existsSync('items.json') ? JSON.parse(readFileSync('items.json', 'utf8')).names : []);
for (const u of posts) {
  const h = await get(u); await sleep(500); if (!h) continue;
  const t = decode(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ''));
  for (const m of t.matchAll(/【([^【】\n]{2,40})】\s*レア度/g)) names.add(m[1].trim());
}
const list = [...names].sort((a, b) => a.localeCompare(b, 'ja'));
writeFileSync('items.json', JSON.stringify({ _説明: 'ポケツイのアイテム名一覧（tools/build-items.mjs で更新）', names: list }, null, 2) + '\n');
console.log(`${posts.size}件の記事から ${list.length}個のアイテム名`);
