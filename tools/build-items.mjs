// 公式サイトのお知らせ（https://www.pokecolotwin.jp/info-list/）からアイテム名一覧 items.json を作る
// 使い方: node tools/build-items.mjs
// お知らせ本文は公式サイトと同じ API（official-site-news）から取る
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const API = 'https://pokecolotwin.wpcomstaging.com/wp-json/wp/v2/official-site-news';
const posts = [];
for (let page = 1; ; page++) {
  const res = await fetch(`${API}?per_page=100&page=${page}&order=desc`);
  if (!res.ok) break;
  const batch = await res.json(); if (!batch.length) break;
  posts.push(...batch);
  if (page >= +res.headers.get('x-wp-totalpages')) break;
}
const text = s => s.replace(/<[^>]+>/g, '\n').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strings = v => typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];
const names = new Set(existsSync('items.json') ? JSON.parse(readFileSync('items.json', 'utf8')).names : []);
for (const p of posts) {
  // アイテム名はお知らせ本文で「」や『』に囲まれて書かれている
  for (const m of text(strings(p).join('\n')).matchAll(/[「『]([^「」『』\n]{2,30})[」』]/g)) {
    const n = m[1].trim();
    if (!/ガチャ|イベント|キャンペーン|セット|パック|お知らせ|メンテナンス|ショップ/.test(n)) names.add(n);
  }
}
const list = [...names].sort((a, b) => a.localeCompare(b, 'ja'));
writeFileSync('items.json', JSON.stringify({ _説明: '公式お知らせから作ったアイテム名一覧（tools/build-items.mjs で更新）', names: list }, null, 2) + '\n');
console.log(`${posts.length}件のお知らせから ${list.length}個のアイテム名`);
