// ガチャ背景の履歴（bg-auto/history.json と縮小jpg）を読み書きする共通の部品
// history.json は新しい順の配列 [{id, date, name, src, from, kind?, url?}]
//   id: ガチャの番号（重複を防ぐ）  date: 'YYYY-MM-DD'  name: ガチャの名前  src: 縮小jpgのファイル名（history.json と同じフォルダ）
//   from: 取得元の種類（公式お知らせ・公式LP・壁紙・手動）  kind: 【ガチャ】【MIX】など  url: 元の画像のURL
// 背景の模様（8種類）はアプリの中で bg-auto/patterns.js を使って作るので、ここでは色を取るための小さな画像だけを残す
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const UA = 'gacha-bg'; // 名前だけ（アカウント名などは送らない）
export const LONG = 256; // 縮小の長辺（色を取るだけなので小さくてよい）

export function loadHistory(dir) {
  const f = path.join(dir, 'history.json');
  if (!existsSync(f)) return [];
  const h = JSON.parse(readFileSync(f, 'utf8'));
  return Array.isArray(h) ? h : (h.items || []);
}

// 新しい順（日付が同じなら元の順のまま）に並べて保存。中身が変わらなければ書かない
export function saveHistory(dir, items) {
  mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'history.json');
  const list = items.map((x, i) => [x, i]).sort((a, b) => (b[0].date || '').localeCompare(a[0].date || '') || a[1] - b[1]).map(a => a[0]);
  const txt = list.length ? '[\n' + list.map(x => '  ' + JSON.stringify(x)).join(',\n') + '\n]\n' : '[]\n';
  if (existsSync(f) && readFileSync(f, 'utf8') === txt) return false;
  writeFileSync(f, txt);
  return true;
}

// 画像（Buffer）を長辺256pxの jpg にして保存し、ファイル名を返す
export async function saveThumb(dir, file, raw) {
  // SHARP はローカルで試すとき用（sharp を入れた場所を指す）。Actions では npm i した sharp を使う
  const { default: sharp } = await import(process.env.SHARP || 'sharp');
  mkdirSync(dir, { recursive: true });
  const buf = await sharp(raw).flatten({ background: '#ffffff' })
    .resize({ width: LONG, height: LONG, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  writeFileSync(path.join(dir, file), buf);
  return file;
}

// 画像を取る（画像でない・小さすぎるときは null）
export async function fetchImage(url, min = 3000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) { console.log('画像を取れません', r.status, url); return null; }
  const b = Buffer.from(await r.arrayBuffer());
  return b.length < min ? null : b;
}

// ファイル名に使えるようにする
export const safe = s => String(s).replace(/[^0-9A-Za-z_-]/g, '_');
// 日本時間の日付 'YYYY-MM-DD'
export const jstDate = d => new Date(new Date(d).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
