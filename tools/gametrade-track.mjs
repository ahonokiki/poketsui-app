// ゲームトレード（ポケコロツイン）の出品を毎日記録して「売れた数ランキング」を作る
// 使い方: RANKING_KEY=合言葉 node tools/gametrade-track.mjs
// - 新着順の一覧（最大99ページ）を記録し、一覧から消えた出品は詳細ページで「取引が終了しました」なら売れたと数える
// - 記録（data/gametrade-state.enc）とランキング（data/gametrade-ranking.enc）は合言葉で暗号化して保存する
//   ゲームトレードの利用規約により内容を公開できないため、暗号化せずに保存・公開しない
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';

const KEY = process.env.RANKING_KEY;
if (!KEY) { console.error('RANKING_KEY（合言葉）が設定されていません。GitHub の Settings → Secrets に RANKING_KEY を登録してください'); process.exit(1); }
const ROOT = new URL('../', import.meta.url), STATE = new URL('data/gametrade-state.enc', ROOT), OUT = new URL('data/gametrade-ranking.enc', ROOT);

// ---- 暗号化：PBKDF2(SHA-256, 20万回) で鍵を作り AES-256-GCM。形式は JSON {v,salt,iv,data}（ブラウザの WebCrypto でも同じ手順で開ける）
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

// ---- 取得
const BASE = 'https://gametrade.jp/pokekoro-twin/exhibits';
const UA = { 'User-Agent': 'Mozilla/5.0 (personal ranking; github.com/ahonokiki/poketsui-app)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 通信が途中で切れることがあるので、3回まで間をあけてやり直す
async function get(url, opt) {
  for (let i = 0; ; i++) {
    try { return await fetch(url, opt); } catch (e) { if (i >= 2) return null; await sleep(5000 * (i + 1)); }
  }
}
const dec = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function listPage(n) {
  const r = await get(`${BASE}?sort=new&page=${n}`, { headers: UA }); if (!r?.ok) return null;
  const out = [];
  for (const m of (await r.text()).matchAll(/name="exhibit_data" type="hidden" value="([^"]+)"/g)) {
    try { const d = JSON.parse(dec(m[1])); out.push({ id: d.id, title: d.name, price: +d.price }); } catch (e) {}
  }
  return out;
}
// 詳細ページ：取引が終わっていれば sold、ページがなければ removed、まだ出品中なら active
async function detail(id) {
  const r = await get(`${BASE}/${id}`, { headers: UA });
  if (!r) return 'unknown';
  if (r.status === 404 || r.status === 410) return 'removed';
  if (!r.ok) return 'unknown';
  const h = await r.text();
  return /取引が終了しました/.test(h) ? 'sold' : /削除されました|公開停止|見つかりません/.test(h) ? 'removed' : 'active';
}

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 日本の日付
const RUN = new Date().toISOString(); // この集計の時刻（1日に2回動かしても、前回と区別できるように）
let state = { listings: {} };
if (existsSync(STATE)) {
  try { state = open(readFileSync(STATE, 'utf8')); }
  catch (e) { console.warn('前回の記録を開けませんでした（合言葉を変えた？）。記録を最初からやり直します'); }
}
const L = state.listings; // id → {t:題名, p:値段, f:初めて見た日, l:最後に一覧で見た日, s:'active'|'sold'|'removed'|'old', d:終わった日}

// 1) 新着順の一覧を記録（最大99ページ・1ページごとに2秒あける）
let seen = 0, pages = 0;
const MAX_PAGES = +process.env.MAX_PAGES || 99; // 試しに動かすとき用
for (let n = 1; n <= MAX_PAGES; n++) {
  const got = await listPage(n); if (!got || !got.length) break; pages++;
  for (const x of got) {
    const o = L[x.id];
    if (o) { o.l = RUN; o.p = x.price; o.t = x.title; if (o.s !== 'active') { o.s = 'active'; delete o.d; } }
    else L[x.id] = { t: x.title, p: x.price, f: today, l: RUN, s: 'active' };
    seen++;
  }
  await sleep(2000);
}
if (!seen) { console.error('一覧から出品を1件も読めませんでした。ゲームトレードのページの作りが変わったかもしれません'); process.exit(1); }

// 2) 今日一覧に出てこなかった出品を確認（1日最大500件・1件ごとに1秒）
const gone = Object.entries(L).filter(([, o]) => o.s === 'active' && o.l !== RUN);
let checked = 0, sold = 0;
for (const [id, o] of gone.slice(0, process.env.MAX_CHECKS ? +process.env.MAX_CHECKS : 500)) {
  const s = await detail(id); checked++;
  if (s === 'sold') { o.s = 'sold'; o.d = today; sold++; }
  else if (s === 'removed') { o.s = 'removed'; o.d = today; }
  else if (s === 'active') o.s = 'old'; // 99ページより後ろに下がっただけ。これ以上は追わない
  await sleep(1000);
}

// 3) 古い記録を消す（終わってから90日・追うのをやめてから30日）
const daysAgo = n => new Date(Date.now() + 9 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
for (const [id, o] of Object.entries(L)) {
  if ((o.s === 'sold' || o.s === 'removed') && o.d < daysAgo(90)) delete L[id];
  else if (o.s === 'old' && o.l < daysAgo(30)) delete L[id];
}

// ---- 集計：題名からアイテム名（またはガチャ名）を取り出してまとめる
const gachas = new Set();
for (let off = 0; off < 3000; off += 100) {
  const r = await get(`https://pokecolotwin.wpcomstaging.com/wp-json/wp/v2/official-site-news?per_page=100&offset=${off}&order=desc`); if (!r?.ok) break;
  const d = await r.json(); if (!d.length) break;
  for (const p of d) { const m = p.title.match(/^【[^】]+】\s*(.+?)\s*登場/); if (m) gachas.add(m[1]); }
  if (d.length < 100) break;
}
const itemsJson = JSON.parse(readFileSync(new URL('items.json', ROOT)));
(itemsJson.items || []).forEach(x => x.g && gachas.add(x.g));
const norm = t => t.normalize('NFKC').replace(/\s/g, '');
const longFirst = arr => arr.map(n => [norm(n), n]).filter(([k]) => k.length >= 4).sort((a, b) => b[0].length - a[0].length);
const byName = longFirst(itemsJson.names), byGacha = longFirst([...gachas]);
const clean = t => t.normalize('NFKC').replace(/【[^】]*】|「[^」]*」|\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, ' ')
  .replace(/双子分|1人分|2人分|一人分|即購入[可○⭕OK]*|最安値?|バラ売り?|原本|レプリカ|オリジナル品?|\d+点(セット)?|セット|まとめ|期間限定|お?値下げ中?|タイムセール中?|売り切り!*|在庫限り|多分|専用|[\p{Extended_Pictographic}️♡♥☆★]/gu, ' ')
  .replace(/\s+/g, ' ').trim().replace(/^[:：/／、,・+\-\s]+|[:：/／、,・+\-\s]+$/g, '');
// 飾りを外した名前。短すぎる・意味のない名前になったら、絵文字と記号だけ外した題名を使う
const plain = t => t.normalize('NFKC').replace(/[\p{Extended_Pictographic}\uFE0F♡♥☆★✦✧◆◇⭐︎]/gu, ' ').replace(/\s+/g, ' ').trim();
function nameOf(title) {
  const c = clean(title).replace(/[【】「」『』［］\[\]]/g, ' ').replace(/[^\p{L}\p{N}]+$/u, '').replace(/^[^\p{L}\p{N}♪]+/u, '').replace(/\s+/g, ' ').trim();
  return c.length < 3 || /^(画像|各|セット|ココリウム|ファッション|アイテム|\d+点?)$/.test(c) ? plain(title) : c;
}
function itemOf(title) {
  const t = norm(title);
  for (const [k, n] of byName) if (t.includes(k)) return { name: n, known: true, kind: 'item' };
  for (const [k, g] of byGacha) if (t.includes(k)) return { name: g, known: true, kind: 'gacha' }; // ガチャ名そのものの出品は「ガチャ・セット」
  // 3点以上のセットは単品ではないので「ガチャ・セット」に入れる
  if (/([3-9]|\d{2,})\s*(点|種)|各\d*種|フルセット|コンプ/.test(title.normalize('NFKC'))) return { name: nameOf(title), known: false, kind: 'gacha' };
  return { name: nameOf(title), known: false, kind: 'item' };
}
// 問い合わせ用の仮の値段や、たくさんのアイテムをまとめた出品はアイテムの人気が分からないので除く
const skip = o => o.p >= 30000 || /^(\d)\1{3,}$/.test(String(o.p)) ||
  /ダブリ|まとめ|引退|一覧|リスト|福袋|詰め合わせ|バラ売|在庫|各種|何点でも|過去ガチャ|\d{4}年|月ガチャ|アカウント|垢|均一|相談|ハピ|all\s|\d+円|販売|ドリフェス|ココリウムセット|^ココリウム$|様\s*(専用)?\s*$|様専用|^専用/i.test(o.t); // 「○○様」だけの専用出品は何のアイテムか分からない
// 1つの出品に何個入っているか（双子分=2、3点セット=3 など）。単価 = 値段 ÷ 個数
function qty(t) { t = t.normalize('NFKC');
  const m = t.match(/(\d+)\s*(点|個|セット|種)/); if (m && +m[1] > 0 && +m[1] <= 50) return +m[1] * (/双子分|2人分|二人分/.test(t) ? 2 : 1);
  return /双子分|2人分|二人分/.test(t) ? 2 : 1; }
const days = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5));
const med = p => { const s = [...p].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
function rank(since) {
  const agg = new Map();
  for (const o of Object.values(L)) {
    if (skip(o)) continue;
    const isSold = o.s === 'sold' && o.d >= since, isActive = o.s === 'active';
    if (!isSold && !isActive) continue;
    const { name, known, kind } = itemOf(o.t), k = kind + name;
    const a = agg.get(k) || { name, known, kind, sold: 0, active: 0, soldPrices: [], activePrices: [], days: [], ex: o.t };
    const q = kind === 'gacha' ? 1 : qty(o.t), unit = Math.round(o.p / q); // セットは1セットとして数える
    if (isSold) { a.sold += q; a.soldPrices.push(unit); a.days.push(days(o.f, o.d)); } else { a.active += q; a.activePrices.push(unit); }
    agg.set(k, a);
  }
  return [...agg.values()].filter(a => a.sold > 0).map(a => ({
    name: a.name, known: a.known, kind: a.kind, sold: a.sold, active: a.active, ex: a.ex,
    price: med(a.soldPrices), low: Math.min(...a.soldPrices), high: Math.max(...a.soldPrices), listPrice: med(a.activePrices), deals: a.soldPrices.length, days: +(a.days.reduce((x, y) => x + y, 0) / a.days.length).toFixed(1),
  })).sort((a, b) => b.sold - a.sold || a.days - b.days);
}
const firstDay = Object.values(L).reduce((m, o) => o.f < m ? o.f : m, today);
const ranking = { updated: today, since: firstDay, tracked: Object.values(L).filter(o => o.s === 'active').length,
  d1: rank(today), // 今日の集計で売れたと分かった分（前回の集計からの約1日）
  d3: rank(daysAgo(3)), d7: rank(daysAgo(7)), d14: rank(daysAgo(14)), d30: rank(daysAgo(30)) };

mkdirSync(new URL('data/', ROOT), { recursive: true });
writeFileSync(STATE, seal(state));
writeFileSync(OUT, seal(ranking));
console.log(`一覧 ${pages}ページ・${seen}件 / 確認 ${checked}件（うち売れた ${sold}件） / 記録中 ${ranking.tracked}件 / 30日ランキング ${ranking.d30.length}種`);
