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
// 通信が途中で切れたり、混雑で断られたり（403・429・5xx）することがあるので、間をあけて3回まで試す
async function get(url, opt) {
  let r = null;
  for (let i = 0; i < 3; i++) {
    try { r = await fetch(url, opt); } catch (e) { r = null; }
    if (r && (r.ok || r.status === 404 || r.status === 410)) return r;
    await sleep(i === 0 ? 5000 : 15000 * i);
  }
  return r;
}
const dec = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
// 一覧の1ページ。最後のページより後ろ（404）は []、取れなかったときは null
async function listPage(n, sort = 'new') {
  const r = await get(`${BASE}?sort=${sort}&page=${n}`, { headers: UA });
  if (r && (r.status === 404 || r.status === 410)) return [];
  if (!r?.ok) return null;
  const out = [];
  for (const m of (await r.text()).matchAll(/name="exhibit_data" type="hidden" value="([^"]+)"/g)) {
    try { const d = JSON.parse(dec(m[1])); out.push({ id: d.id, title: d.name, price: +d.price }); } catch (e) {}
  }
  return out;
}
// 詳細ページ：取引が終わっていれば sold、ページがなければ removed、「購入する」ボタンがあれば active（まだ出品中）、
// どちらでもなければ pending（購入されて取引中など。次の集計でもう一度確かめる）
async function detail(id) {
  const r = await get(`${BASE}/${id}`, { headers: UA });
  if (!r) return { s: 'unknown' };
  if (r.status === 404 || r.status === 410) return { s: 'removed' };
  if (!r.ok) return { s: 'unknown' };
  const h = await r.text();
  // 出品の説明文（「○○様」の専用出品は、ここにアイテム名が書いてあることが多い）
  const desc = dec(((h.match(/class="item-description">([\s\S]*?)<\/div>/) || [])[1] || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).trim().slice(0, 500);
  const s = /取引が終了しました/.test(h) ? 'sold' : /購入する/.test(h) ? 'active' : 'pending';
  // 出品者（同じ人がまとめて売っただけかを見分けるため）と、取引コメントの「購入させていただきます … 約5時間前」から買われた時刻の目安
  const u = (h.match(/href="\/users\/(\d+)"/) || [])[1];
  const m = h.match(/購入させていただきます[\s\S]{0,300}?約?\s*(\d+)\s*(分|時間|日)前/);
  const ago = m ? +m[1] * (m[2] === '分' ? 60e3 : m[2] === '時間' ? 3600e3 : 864e5) : null;
  return { s, desc, u, ago };
}

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 日本の日付
const RUN = new Date().toISOString();
const daysAgo = n => new Date(Date.now() + 9 * 3600e3 - n * 864e5).toISOString().slice(0, 10); // この集計の時刻（1日に2回動かしても、前回と区別できるように）
let state = { listings: {} };
if (existsSync(STATE)) {
  try { state = open(readFileSync(STATE, 'utf8')); }
  catch (e) {
    // 黙って最初からやり直すと、これまでの記録が消えたことに気づけない。わざと（RESET=1）のときだけやり直す
    if (process.env.RESET !== '1') { console.error('前回の記録を開けませんでした（合言葉が違う？）。やり直すなら RESET=1 を付けて実行してください'); process.exit(1); }
    console.warn('前回の記録を開けません。RESET=1 なので記録を最初からやり直します');
  }
}
state.firstRun ??= RUN; // 初めて集計した時刻（急上昇の「前の期間」が記録の中にあるかの判定に使う）
// 以前の「安い順」の一覧で見つけた出品（nw:false）は新着順の一覧には出てこないので、消えた扱いの確認で枠を食うだけ。記録から外す（一度きりの片付け）
for (const [id, o] of Object.entries(state.listings)) if (o.nw === false && o.s === 'active') delete state.listings[id];
// 記録を始めた日（この日の一覧に出ていた出品は、それより前から出ていたので「売れるまで」の日数が分からない）
state.since ??= Object.values(state.listings).reduce((m, o) => o.f < m ? o.f : m, today);
const L = state.listings; // id → {t:題名, p:値段, f:初めて見た日, l:最後に一覧で見た時刻, s:'active'|'sold'|'removed'|'old', d:終わった日, dt:売れたと分かった時刻, c:最後に詳細を確かめた時刻, nw:新着順で見つけたか}

// 1) 新着順の一覧を記録（最大99ページ＝新しい出品のおよそ10日分・1ページごとに2秒あける）
//    99ページより後ろに下がった出品は、2) で確かめ直して後から売れた分も数える
let seen = 0, pages = 0, partial = false;
const MAX_PAGES = process.env.MAX_PAGES ? +process.env.MAX_PAGES : 99; // 試しに動かすとき用
// 新着順は「最後に更新した順」。値下げなどで古い出品が先頭に戻ってくるので、記録済みのいちばん新しい id より小さい id は「編集で戻ってきた出品」（b:true）
const maxId = Math.max(0, ...Object.keys(L).map(Number));
for (const sort of ['new']) {
  for (let n = 1; n <= MAX_PAGES; n++) {
    const got = await listPage(n, sort);
    if (got === null) { partial = true; console.warn(`一覧の ${n} ページ目を取れませんでした。この回は「消えた出品」の確認を見送ります`); break; }
    if (!got.length) break; pages++;
    for (const x of got) {
      const o = L[x.id];
      if (o) { o.l = RUN; o.p = x.price; o.t = x.title; if (o.s !== 'active') { o.s = 'active'; delete o.d; delete o.dt; } }
      else L[x.id] = { t: x.title, p: x.price, f: today, ft: RUN, l: RUN, s: 'active', ...(maxId && +x.id < maxId ? { b: true } : {}) };
      seen++;
    }
    await sleep(2000);
  }
}
if (!seen && MAX_PAGES) { console.error('一覧から出品を1件も読めませんでした。ゲームトレードのページの作りが変わったかもしれません'); process.exit(1); }

// 2) 一覧に出てこなかった出品を詳細ページで確かめる（1回最大800件・1件ごとに1秒）
//    まず今回一覧から消えた出品、残りの回数で「一覧の外に下がった出品」（30日以内に見つけたもの）を、前に確かめたのが古い順に確かめ直す
const BUDGET = process.env.MAX_CHECKS ? +process.env.MAX_CHECKS : 800;
//    一覧を全部読めなかった回は、読めなかったページの出品まで「消えた」と見えてしまうので、消えた出品の確認はしない
//    消えた出品は新しい id（最近の出品）から先に確かめる（売れた出品は新しいものに多いため）
const gone = partial ? [] : Object.entries(L).filter(([, o]) => o.s === 'active' && o.l !== RUN).sort(([a], [b]) => +b - +a);
const recheck = Object.entries(L).filter(([, o]) => o.s === 'old' && o.f >= daysAgo(30)).sort(([, a], [, b]) => (a.c || '').localeCompare(b.c || ''));
let checked = 0, sold = 0;
const jstDate = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
for (const [id, o] of [...gone, ...recheck].slice(0, BUDGET)) {
  const { s, desc, u, ago } = await detail(id); checked++; o.c = RUN;
  if (u) o.u = u;
  if (s === 'sold') { // 買われた時刻の目安（コメントの「約N時間前」）があればそれ、なければ確かめた時刻
    const dt = ago ? new Date(Date.now() - ago).toISOString() : RUN;
    o.s = 'sold'; o.dt = dt; o.d = jstDate(Date.parse(dt)); sold++; if (desc) o.x = desc; } // 説明文も残す（専用出品のアイテム名を探すため）
  else if (s === 'removed') { o.s = 'removed'; o.d = today; }
  else if (s === 'active') o.s = 'old'; // 一覧の外に下がっただけ。ときどき確かめ直す
  // pending（取引中など）と unknown（つながらない）は active のまま。次の集計でもう一度確かめる
  await sleep(1000);
}

// 3) 古い記録を消す（終わってから90日・追うのをやめてから30日）
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
// アイテム名の「/」の後ろに付く言葉（顔パーツ・黒・手持ち など）
const suffixes = new Set(itemsJson.names.map(n => (n.normalize('NFKC').match(/\/([^/]+)$/) || [])[1]).filter(Boolean));
const byName = longFirst(itemsJson.names), byGacha = longFirst([...gachas]);
const clean = t => t.normalize('NFKC').replace(/【[^】]*】|「[^」]*」|\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, ' ')
  .replace(/双子分(に変更|も可能|も可|あり|可|OK|⭕|🉑)?|1人分|2人分|一人分|即購入[可○⭕OK]*|最安値?|再安価|最安価|最終日|人気[RNS]品|[RNSC]品|マジチェン|素材|フルセット|バラ売り?|原本|レプリカ|オリジナル品?|[×✕✖x]\s*\d+\s*$|\d+(点|個)(セット)?|(?<![\p{Script=Katakana}ー])セット|まとめ|期間限定|お?値下げ中?|タイムセール中?|売り切り!*|在庫限り|多分|専用|[\p{Extended_Pictographic}️♡♥☆★]/gu, ' ')
  .replace(/\s+/g, ' ').trim().replace(/^[:：/／、,・+\-\s]+|[:：/／、,・+\-\s]+$/g, '');
// 飾りを外した名前。短すぎる・意味のない名前になったら、絵文字と記号だけ外した題名を使う
const plain = t => t.normalize('NFKC').replace(/[\p{Extended_Pictographic}\uFE0F♡♥☆★✦✧◆◇⭐︎]/gu, ' ').replace(/\s+/g, ' ').trim();
// 題名から商品名だけを取り出す。商品名が残らない題名（「2点セット」など）は null
function nameOf(title) {
  let t = title.normalize('NFKC').replace(/《[^》]*》|〈[^〉]*〉|<[^>]*>/g, ' ').replace(/^[^《]*》/, ' ').replace(/^[^「]*」/, ' '); // 「〇》」「即購入可》」のような前置きは外す
  const c = clean(t).replace(/[【】「」『』《》［］\[\]]/g, ' ').replace(/\d+\s*(個|点|コ)/g, ' ')
    .replace(/[^\p{L}\p{N}]+$/u, '').replace(/^[^\p{L}\p{N}♪]+/u, '').replace(/\s+/g, ' ').trim();
  return c.length < 3 || /^(画像|各|セット|ココリウム|ファッション|アイテム|\d+点?|点セット|セット販売|まとめ)$/.test(c) ? null : c;
}
// 3点以上のセット・コンプ・フルセットは単品ではなく「ガチャ・セット」
const isSetTitle = t => /([3-9]|\d{2,})\s*(点|種)|各\d*種|フルセット|コンプ/.test(t.normalize('NFKC'));
function itemOf(title) {
  const t = norm(title);
  if (isSetTitle(title)) { for (const [k, g] of byGacha) if (t.includes(k)) return { name: g, known: true, kind: 'gacha' }; return { name: nameOf(title) || plain(title), known: false, kind: 'gacha' }; }
  for (const [k, n] of byName) if (t.includes(k)) return { name: n, known: true, kind: 'item' };
  for (const [k, g] of byGacha) if (t.includes(k)) return { name: g, known: true, kind: 'gacha' }; // ガチャ名そのものの出品は「ガチャ・セット」
  return { name: nameOf(title), known: false, kind: 'item' };
}
// 問い合わせ用の仮の値段や、たくさんのアイテムをまとめた出品はアイテムの人気が分からないので除く
// 問い合わせ用の仮の値段：11111円以上のゾロ目・123456のような並び・30万円以上
const fakePrice = p => (p >= 11111 && /(\d)\1{3,}/.test(String(p))) || /^(1234|12345|98765|54321|9876)\d*$/.test(String(p)) || p >= 300000;
const skip = o => fakePrice(o.p) ||
  /ダブリ|まとめ(売|買|て)|一覧|リスト|福袋|詰め合わせ|バラ売|在庫(あり|多数|処分|複数|一覧)|各種|何点でも|過去ガチャ|\d{4}年|月ガチャ|引退(アカウント|垢|まとめ|一覧)|(引退|販売|譲渡)垢|垢(販売|売|譲渡)|均一|相談|ハピガチャ|all\s|\d+円(均一|〜|~|以上|から)|販売(中|リスト|一覧|ページ)|ドリフェス|ココリウムセット|^ココリウム$/i.test(o.t);
// 1つの出品に何個入っているか（双子分=2、3点セット=3 など）。単価 = 値段 ÷ 個数
// 「双子分に変更可」「双子分も可能」は双子分ではない（1個）
const isTwin = t => /双子分(?!\s*(に変更|も可|可|あり|有|OK|⭕|🉑|→|変更))|2人分|二人分/u.test(t.normalize('NFKC'));
function qty(t) { t = t.normalize('NFKC').replace(/レベル\s*\d+|Lv\.?\s*\d+|\d{4}年|No\.?\s*\d+/gi, ' ');
  const m = t.match(/(\d+)\s*(点|個|種|(?<![\p{Script=Katakana}ー])セット)/u) || t.match(/[×✕✖x]\s*(\d+)\s*$/u);
  if (m && +m[1] > 0 && +m[1] <= 50) return +m[1] * (isTwin(t) ? 2 : 1);
  return isTwin(t) ? 2 : 1; }
const days = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5));
const med = p => { const s = [...p].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
// 「○○様」「専用」だけの題名：アイテム名は説明文から探す
const isReserved = t => /様\s*(専用)?\s*$|様専用|^専用|専用出品/.test(t.normalize('NFKC'));
// 文の中からアイテム名一覧の名前をすべて探す（長い名前から先に、重ならないように）
function knownNamesIn(text) {
  let t = norm(text); const found = [];
  for (const [k, n] of byName) { if (t.includes(k)) { found.push(n); t = t.split(k).join('\u0000'); } }
  return found;
}
// 説明文（専用出品など）の各行から、アイテム名らしい行だけを拾う（挨拶や取引の説明の行は捨てる）
const NOT_ITEM = /購入|お願い|様|専用|コメント|マイコード|贈り|ありがと|よろしく|即購入|発送|取引|こちら|ページ|以外|不可|可能|お渡し|レベル|アカウント|送信|木の実|ハピ|円|¥|ご希望|ご覧|在庫|割引|値下げ|セール|まとめ|バラ|リスト|引退|プロフ|確認|対応|日以内|時間|変更|返信|受け取|ゲームトレード|ID|本人|トラブル|警告|評価|注意|ください|です|ます|した|して/;
function namesFromDesc(x) {
  if (!x) return [];
  const out = [];
  for (const line of x.normalize('NFKC').split(/\n|、|,|・|\/|／|＋|\+|&/)) {
    const n = nameOf(line); if (!n) continue;
    if (n.length < 4 || n.length > 30 || NOT_ITEM.test(line) || /^\d+$/.test(n) || !/[\p{Script=Katakana}\p{Script=Hiragana}\p{Script=Han}]/u.test(n)) continue;
    out.push(n);
  }
  return [...new Set(out)];
}
// 1つの出品を「どのアイテムが何個・1個いくらで」に分ける
function entriesOf(o) {
  const reserved = isReserved(o.t);
  const names = knownNamesIn(reserved ? o.t + '\n' + (o.x || '') : o.t);
  // 説明文に「アイテム名 400」のように1個ずつの値段が書いてあれば、それを単価にする
  const priceIn = n => { if (!reserved || !o.x) return null;
    const m = o.x.normalize('NFKC').replace(/\s/g, '').match(new RegExp(norm(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[:：¥￥]*(\\d{2,6})円?'));
    return m ? +m[1] : null; };
  if (reserved && names.length && names.every(priceIn)) return names.map(n => ({ name: n, known: true, kind: 'item', q: 1, unit: priceIn(n), priced: true }));
  if (names.length >= 2) { // 複数のアイテムをまとめた出品：値段を個数で割って、それぞれ1個ずつ数える（双子分なら2個ずつ）
    const each = isTwin(o.t) ? 2 : 1, unit = Math.round(o.p / (names.length * each));
    return names.map(n => ({ name: n, known: true, kind: 'item', q: each, unit, priced: false })); // 1個ずつの値段は分からないので単価には使わない
  }
  if (names.length === 1 && !isSetTitle(o.t)) { const q = qty(reserved ? o.t + ' ' + (o.x || '') : o.t); return [{ name: names[0], known: true, kind: 'item', q, unit: Math.round(o.p / q), priced: !reserved }]; } // 専用出品は他のアイテムの分も入っていることがあるので単価に使わない
  if (reserved) return namesFromDesc(o.x).map(n => ({ name: n, known: false, kind: 'item', q: 1, unit: 0, priced: false })); // 一覧にない名前は説明文の行から拾う（単価は出さない）
  const { name, known, kind } = itemOf(o.t), q = kind === 'gacha' ? 1 : qty(o.t); // セットは1セットとして数える
  if (kind === 'item') {
    // 「A 3個&B 1個」「A＋B」のように商品名が並んだ題名は、商品ごとに分けて数える（値段の内訳は分からないので単価には使わない）
    // 「/顔パーツ」「/黒」のように名前の一部の「/」（後ろの言葉がアイテム名に付く語か4文字以下）では区切らない
    const T = o.t.normalize('NFKC');
    if (/[&+＋＆]|各|ずつ/.test(T)) { // 「、」だけの題名や「3/4」のような数字の「/」では分けない
      const sep = T.replace(/\/([^/\s&+、]+)/g, (m, w) => suffixes.has(w) || w.length <= 4 || /^\d/.test(w) ? '\u0001' + w : '/' + w);
      const twin = isTwin(T) ? 2 : 1;
      const parts = sep.split(/[&+＋＆/]/).map(x => x.replace(/\u0001/g, '/')).map(x => ({ n: nameOf(x), q: /\d+\s*(点|個)/.test(x.normalize('NFKC')) ? qty(x) : twin })).filter(x => x.n);
      if (parts.length >= 2) return parts.map(x => ({ name: x.n, known: false, kind: 'item', q: x.q, unit: 0, priced: false }));
    }
    if (!name) { // 題名に商品名がない（「2点セット」など）：説明文の行からアイテム名を拾う。なければ数えない
      const fromDesc = o.x ? knownNamesIn(o.x) : [];
      return (fromDesc.length ? fromDesc : namesFromDesc(o.x)).map(n => ({ name: n, known: fromDesc.includes(n), kind: 'item', q: 1, unit: 0, priced: false }));
    }
  }
  // 名前が分からず「1点ずつ」「各」「＋」や、個数の書いていない「セット」がある単品は、何個分の値段か分からないので単価に使わない
  // 「/顔パーツ」「/黒紫」「&しっぽ」のようにアイテム名そのものに入っている「/」「&」は区切りとみなさない
  const t = o.t.normalize('NFKC');
  const mixed = kind === 'item' && (/ずつ|各|[+、]/.test(t) || (/(?<![\p{Script=Katakana}ー])セット/u.test(t) && q === 1) || [...t.matchAll(/\/([^/\s]+)/g)].some(([, w]) => !suffixes.has(w) && w.length > 4));
  return [{ name, known, kind, q, unit: Math.round(o.p / q), priced: !mixed }];
}
// 同じ商品の書き方の違い（空白・記号）をまとめるための鍵
const keyOf = n => n.normalize('NFKC').replace(/[\s♡♥☆★・･.,、。!！?？~〜ー\-]/g, '').toLowerCase();
// 直近 N 日（N=1 なら24時間）に売れた分のランキング。あわせて
// - prev：その前の同じ長さの期間に売れた数（急上昇を見るため。記録を始める前にかかる期間なら null）
// - rate：売れやすさ＝売れた数 ÷（売れた数＋今出品中の数）。出品が少ないのに売れている商品ほど高い
const soldMs = o => Date.parse(o.dt || o.d + 'T12:00:00+09:00');
function rank(N) {
  const now = Date.now(), from = now - N * 864e5, prevFrom = now - 2 * N * 864e5;
  const prevKnown = prevFrom >= Date.parse(state.firstRun || state.since + 'T00:00:00+09:00') + 12 * 3600e3; // 前の期間が記録の中に収まっているときだけ比べる
  const agg = new Map();
  for (const [id, o] of Object.entries(L)) {
    if (skip(o)) continue; o.id = id;
    const t = o.s === 'sold' ? soldMs(o) : 0;
    const isSold = o.s === 'sold' && t >= from, isPrev = o.s === 'sold' && t >= prevFrom && t < from, isActive = o.s === 'active' || o.s === 'old'; // 'old'（一覧の外に下がったがまだ出品中）も出品中に数える
    if (!isSold && !isPrev && !isActive) continue;
    for (const { name, known, kind, q, unit, priced } of entriesOf(o)) {
      const k = kind + keyOf(name), a = agg.get(k) || { name, known, kind, sold: 0, prev: 0, active: 0, soldPrices: [], activePrices: [], days: [], ex: o.t, deals: new Set(), sellers: new Set() };
      // 単価は「1回の取引ごとの1個あたりの値段」を並べて、その真ん中の値を使う
      // 単価が分からない取引は、個数だけ数えて単価の計算には入れない
      // 売れるまでの日数：初めて見た時刻から売れた時刻まで。記録を始めた日にすでに出ていた出品・編集で先頭に戻ってきた出品（b）は、いつ出品されたか分からないので入れない
      if (isSold) { a.sold += q; a.deals.add(o.id); if (o.u) a.sellers.add(o.u); if (priced) a.soldPrices.push(unit);
        if (o.f > state.since && o.nw !== false && !o.b && o.ft) a.days.push(Math.max(0, (Date.parse(o.dt || o.d + 'T12:00:00+09:00') - Date.parse(o.ft)) / 864e5)); }
      else if (isPrev) a.prev += q;
      else { a.active += q; if (priced) a.activePrices.push(unit); }
      agg.set(k, a);
    }
  }
  // 並び順：売れた個数 → 取引件数 → 出品者数（同数のときは、たくさんの取引・たくさんの出品者から売れたものを上に）
  // 売れやすさ：売れた数＋出品中が3以上のときだけ出す（1個売れて出品中0個の100%を並べないため）。並べ替えは縮めた値 (sold+1)/(sold+active+3)
  return [...agg.values()].filter(a => a.sold > 0).map(a => ({
    name: a.name, known: a.known, kind: a.kind, sold: a.sold, active: a.active, ex: a.ex, deals: a.deals.size, sellers: a.sellers.size,
    prev: prevKnown ? a.prev : null, rate: a.sold + a.active >= 3 ? Math.round(a.sold / (a.sold + a.active) * 100) : null, rateSort: (a.sold + 1) / (a.sold + a.active + 3),
    days: a.days.length ? +(a.days.reduce((x, y) => x + y, 0) / a.days.length).toFixed(1) : null,
    price: med(a.soldPrices), low: a.soldPrices.length ? Math.min(...a.soldPrices) : null, high: a.soldPrices.length ? Math.max(...a.soldPrices) : null, listPrice: med(a.activePrices), priced: a.soldPrices.length,
  })).sort((a, b) => b.sold - a.sold || b.deals - a.deals || b.sellers - a.sellers || (a.days ?? 99) - (b.days ?? 99));
}
// 説明文を残していなかった専用出品は、1回だけ詳細ページを見て説明文を取っておく
for (const [id, o] of Object.entries(L).filter(([, o]) => o.s === 'sold' && o.x === undefined && isReserved(o.t)).slice(0, 100)) {
  const { desc } = await detail(id); o.x = desc || ''; await sleep(1000);
}
const firstDay = state.since;
const ranking = { updated: today, updatedAt: RUN, since: firstDay, tracked: Object.values(L).filter(o => o.s === 'active').length,
  d1: rank(1), d3: rank(3), d7: rank(7), d14: rank(14), d30: rank(30) }; // d1 は直近24時間

mkdirSync(new URL('data/', ROOT), { recursive: true });
for (const o of Object.values(L)) delete o.id;
writeFileSync(STATE, seal(state));
writeFileSync(OUT, seal(ranking));
console.log(`一覧 ${pages}ページ・${seen}件 / 確認 ${checked}件（うち売れた ${sold}件） / 記録中 ${ranking.tracked}件 / 30日ランキング ${ranking.d30.length}種`);
