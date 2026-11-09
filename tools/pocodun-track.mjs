// ゲームトレード（ポコダン）の出品を毎日記録する（相場・売れたキャラを、あとで計算するための記録だけ）
// 使い方: RANKING_KEY=合言葉 node tools/pocodun-track.mjs
// - 新着順の一覧（最大99ページ）を記録。一覧から消えた出品は詳細ページで確かめ、売れた出品は説明文も残す（石・運UP・キャラを読むため）
// - 値段が変わったら、その日と値段を残す（値下げしてから売れるまでの日数を見るため）
// - 記録（data/pocodun-state.enc）は合言葉で暗号化して保存する。ゲームトレードの利用規約により、内容は公開しない
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';

const KEY = process.env.RANKING_KEY;
if (!KEY) { console.error('RANKING_KEY（合言葉）が設定されていません'); process.exit(1); }
const STATE = new URL('../data/pocodun-state.enc', import.meta.url);
const ITER = 200000;
function seal(obj) {
  const salt = randomBytes(16), iv = randomBytes(12), key = pbkdf2Sync(KEY, salt, ITER, 32, 'sha256');
  const c = createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([c.update(gzipSync(JSON.stringify(obj))), c.final(), c.getAuthTag()]);
  return JSON.stringify({ v: 1, iter: ITER, salt: salt.toString('base64'), iv: iv.toString('base64'), data: body.toString('base64') });
}
function open(text) {
  const j = JSON.parse(text), key = pbkdf2Sync(KEY, Buffer.from(j.salt, 'base64'), j.iter, 32, 'sha256'), buf = Buffer.from(j.data, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(j.iv, 'base64')); d.setAuthTag(buf.subarray(-16));
  return JSON.parse(gunzipSync(Buffer.concat([d.update(buf.subarray(0, -16)), d.final()])));
}
const BASE = 'https://gametrade.jp/pocodun/exhibits';
const UA = { 'User-Agent': 'Mozilla/5.0 (personal ranking; github.com/ahonokiki/poketsui-app)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) { let r = null; for (let i = 0; i < 3; i++) { try { r = await fetch(url, { headers: UA }); } catch (e) { r = null; } if (r && (r.ok || r.status === 404 || r.status === 410)) return r; await sleep(i === 0 ? 5000 : 15000 * i); } return r; }
const dec = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function listPage(n) {
  const r = await get(`${BASE}?sort=new&page=${n}`);
  if (r && (r.status === 404 || r.status === 410)) return [];
  if (!r?.ok) return null;
  const out = [], html = await r.text();
  for (const m of html.matchAll(/name="exhibit_data" type="hidden" value="([^"]+)"/g)) { try { const d = JSON.parse(dec(m[1])); out.push({ id: d.id, title: d.name, price: +d.price }); } catch (e) {} }
  return out;
}
async function detail(id) {
  const r = await get(`${BASE}/${id}`);
  if (!r) return { s: 'unknown' };
  if (r.status === 404 || r.status === 410) return { s: 'removed' };
  if (!r.ok) return { s: 'unknown' };
  const h = await r.text();
  const desc = dec(((h.match(/class="item-description">([\s\S]*?)<\/div>/) || [])[1] || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).trim().slice(0, 2000);
  const s = /取引が終了しました/.test(h) ? 'sold' : /購入する/.test(h) ? 'active' : 'pending';
  const u = (h.match(/href="\/users\/(\d+)"/) || [])[1];
  const m = h.match(/購入させていただきます[\s\S]{0,300}?約?\s*(\d+)\s*(分|時間|日)前/);
  const ago = m ? +m[1] * (m[2] === '分' ? 60e3 : m[2] === '時間' ? 3600e3 : 864e5) : null;
  return { s, desc, u, ago };
}
const RUN = new Date().toISOString(), jst = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10), today = jst(Date.now()), daysAgo = n => jst(Date.now() - n * 864e5);
let state = { listings: {} };
if (existsSync(STATE)) { try { state = open(readFileSync(STATE, 'utf8')); } catch (e) { if (process.env.RESET !== '1') { console.error('前回の記録を開けませんでした（合言葉が違う？）'); process.exit(1); } } }
state.since ??= today;
const L = state.listings; // id → {t:題名, p:値段, ph:[[日,値段]...], f:初めて見た日, l:最後に一覧で見た時刻, s:'active'|'old'|'sold'|'removed', d:終わった日, x:説明文, u:出品者}
let seen = 0, pages = 0, partial = false;
const MAX_PAGES = process.env.MAX_PAGES ? +process.env.MAX_PAGES : 99;
for (let n = 1; n <= MAX_PAGES; n++) {
  const got = await listPage(n);
  if (got === null) { partial = true; console.warn(`一覧の ${n} ページ目を取れませんでした`); break; }
  if (!got.length) break; pages++;
  for (const x of got) {
    const o = L[x.id];
    if (o) { if (o.p !== x.price) (o.ph ??= [[o.f, o.p]]).push([today, x.price]); o.l = RUN; o.p = x.price; o.t = x.title; if (o.s !== 'active') { o.s = 'active'; delete o.d; } }
    else L[x.id] = { t: x.title, p: x.price, f: today, l: RUN, s: 'active' };
    seen++;
  }
  await sleep(2000);
}
if (!seen && MAX_PAGES) { console.error('一覧から出品を1件も読めませんでした'); process.exit(1); }
const BUDGET = process.env.MAX_CHECKS ? +process.env.MAX_CHECKS : 400;
const gone = partial ? [] : Object.entries(L).filter(([, o]) => o.s === 'active' && o.l !== RUN).sort(([a], [b]) => +b - +a);
const recheck = Object.entries(L).filter(([, o]) => o.s === 'old' && o.f >= daysAgo(30)).sort(([, a], [, b]) => (a.c || '').localeCompare(b.c || ''));
let checked = 0, sold = 0;
for (const [id, o] of [...gone, ...recheck].slice(0, BUDGET)) {
  const { s, desc, u, ago } = await detail(id); checked++; o.c = RUN; if (u) o.u = u;
  if (s === 'sold') { o.s = 'sold'; o.d = jst(ago ? Date.now() - ago : Date.now()); if (desc) o.x = desc; sold++; }
  else if (s === 'removed') { o.s = 'removed'; o.d = today; }
  else if (s === 'active') o.s = 'old';
  await sleep(1000);
}
for (const [id, o] of Object.entries(L)) { if ((o.s === 'sold' || o.s === 'removed') && o.d < daysAgo(120)) delete L[id]; else if (o.s === 'old' && o.l < daysAgo(30)) delete L[id]; }
writeFileSync(STATE, seal(state) + '\n');
const all = Object.values(L);
console.log(`ポコダン 一覧 ${pages}ページ・${seen}件 / 確認 ${checked}件（うち売れた ${sold}件） / 記録中 ${all.length}件・売れた合計 ${all.filter(o => o.s === 'sold').length}件（${state.since}から）`);
