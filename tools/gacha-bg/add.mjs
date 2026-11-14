// ガチャの画像を手で入れて、背景の履歴（history.json と縮小jpg）に足す。ポコダンは自動で取れる所がないのでこれを使う
// 使い方: node tools/gacha-bg/add.mjs フォルダ 画像（ファイルかURL） ガチャの名前 [日付 YYYY-MM-DD] [id]
//   例: node tools/gacha-bg/add.mjs pocodun/bg-auto ゴッドラッシュ1.png ゴッドラッシュ1 2026-11-07
// 同じ id（省略すると「日付＋名前」）がもう入っていれば何もしない
import { readFileSync } from 'node:fs';
import { loadHistory, saveHistory, saveThumb, fetchImage, safe, jstDate } from './lib.mjs';
const [dir, img, name, date = jstDate(Date.now()), id0] = process.argv.slice(2);
if (!dir || !img || !name || !/^\d{4}-\d\d-\d\d$/.test(date)) { console.log('使い方: node tools/gacha-bg/add.mjs フォルダ 画像 ガチャの名前 [日付 YYYY-MM-DD] [id]'); process.exit(1); }
const hist = loadHistory(dir);
const id = id0 || `m-${date}-${name}`;
if (hist.some(x => x.id === id)) { console.log('もう入っています', id); process.exit(0); }
const raw = /^https?:/.test(img) ? await fetchImage(img) : readFileSync(img);
if (!raw) throw new Error('画像を読めません: ' + img);
const src = await saveThumb(dir, `${date}_${safe(id0 || 'm' + Date.now().toString(36))}.jpg`, raw);
hist.push({ id, date, name, src, from: '手動' });
saveHistory(dir, hist); console.log('追加', date, name, src);
