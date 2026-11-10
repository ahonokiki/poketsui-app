// 副業で売るゲームを選ぶための「売れ行き調べ」（1週間ほど、1日2回）
// 使い方: RANKING_KEY=合言葉 SURVEY_IN=前回の記録 SURVEY_OUT=今回の記録 node tools/market-survey.mjs
// - 候補のゲームごとに、新着一覧の最初の数ページを記録する
// - 一覧から消えた出品は詳細ページで確かめる（「取引が終了しました」なら売れた、ページがなければ取り下げ、「購入する」があればまだ出品中）
// - 記録は合言葉で暗号化して保存する。ゲームトレードの利用規約により、内容は公開しない
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';

const KEY = process.env.RANKING_KEY;
if (!KEY) { console.error('RANKING_KEY（合言葉）が設定されていません'); process.exit(1); }
const IN = process.env.SURVEY_IN, OUT = process.env.SURVEY_OUT;
if (!OUT) { console.error('SURVEY_OUT（記録の書き出し先）がありません'); process.exit(1); }
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

// 調べるゲーム（全4,495本の活気とゲーム自体の人気で選んだ候補。スマホで遊べるものだけ。妻の3本は物差しとして入れる）
const GAMES = process.env.SURVEY_GAMES ? process.env.SURVEY_GAMES.split(',') : ['pazudora', 'dbz-dokkan', 'monst', 'efootball', 'fate-go', 'knives-out', 'prospi-a', 'onepiece-tc', 'genshin-impact', 'pokemon-tcg-pocket',
  'wutheringwaves', 'umamusume', 'gakuen-idolmaster', 'drangonquest-walk', 'opbr', 'ggene-eternal', 'brawl-stars', 'yugio-masterduel', 'battlecats',
  'nikke', 'db-legends', 'mahjongsoul', 'arknights-endfield', 'yokai-punipuni', 'granblue', '7taizai-grandx', 'hololive-dreams', 'yugio', 'pawapuro',
  'inazuma-cross', 'wizardry-daphne', 'another-eden', 'arknitgts', 'zzz', 'reverse1999', 'blue_archive', 'houkaistarrail', 'romasaga-reunivers',
  'shadowverse-wb', 'bang-dream', 'sololeveling', 'epicseven', 'stellasora',
  // 追加：点数は低いがスマホで活気のあるもの
  'dq-tact', 'heavenburnsred', 'bleach-bravesouls', 'jujutsuphanpara', 'last-cloudia', 'madoka-exedra', 'gensosuikoden-star-leap', 'kotodaman', 'czn', 'tensura-maoryuu', 'pj_sekai', 'twsted-wanderland',
  // 追加：出品は中くらい（20〜98ページ）で競合が少なめかもしれないもの
  'bleach-mh', 'monmusu-td', 'ayarabu', 'sakatsuku2025', 'song-for-prism', 'aigis', 'cookierun-kingdom', 'haikyu-haidori', 'krbs-sr', 'assaultlily_lb', 'jojo-oradora', 'otogi-frontier',
  // 追加：着せかえ・アバター系（妻の見立て：ポケツイ・ピグパは、お金を使うことをためらわない大人の女性の買い手が多い。似た客層のゲーム）
  'pokecolo-universe', 'pokecolo', 'pokepia', 'pocketland', 'tomotoru', 'hello-sweetdays', 'hkw2', 'koisuru-pairium', 'mylittledoll', 'sensil', 'ameba-pigg', 'livlyIsland',
  // 追加：夜の仕事の女性など、お金を使う大人の女性に人気と調べたゲーム（女性向けの売上ランキング・体験談などから）
  'enstar-music', 'loveanddeepspace', 'tokyodebunker', 'idolish7', 'touken', 'touken-puzzle', 'mahoyaku', 'tsumtsum', '18trip', 'breakmycase', 'a3', 'hypnosismic', 'standmyheros', 'yume-100', 'identity-v', 'sparklink-stars',
  'pocodun', 'pokekoro-twin', 'pigg-party'];
const PAGES = +(process.env.SURVEY_PAGES || 5), CHECKS = +(process.env.SURVEY_CHECKS || 30), SAMPLE = +(process.env.SURVEY_SAMPLE ?? 6);
const UA = { 'User-Agent': 'Mozilla/5.0 (personal market research)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) { let r = null; for (let i = 0; i < 3; i++) { try { r = await fetch(url, { headers: UA }); } catch (e) { r = null; } if (r && (r.ok || r.status === 404 || r.status === 410)) return r; await sleep(i === 0 ? 5000 : 15000 * i); } return r; }
const dec = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function listPage(g, n) {
  const r = await get(`https://gametrade.jp/${g}/exhibits?sort=new&page=${n}`);
  if (r && (r.status === 404 || r.status === 410)) return [];
  if (!r?.ok) return null;
  const out = [], html = await r.text();
  // 出品ごとの hidden input の後ろに、説明文の最初の部分が続く（アカウント売りかアイテム売りかを見分けるために残す）
  for (const m of html.matchAll(/name="exhibit_data" type="hidden" value="([^"]+)"([\s\S]*?)(?=name="exhibit_data"|$)/g)) {
    try { const d = JSON.parse(dec(m[1])), ds = dec(((m[2].match(/class="description"><p>([\s\S]*?)<\/p>/) || [])[1] || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      out.push({ id: d.id, price: +d.price, title: String(d.name || '').slice(0, 60), desc: ds.slice(0, 100) }); } catch (e) {} }
  return out;
}
async function detail(g, id) {
  const r = await get(`https://gametrade.jp/${g}/exhibits/${id}`);
  if (!r) return { s: 'unknown' };
  if (r.status === 404 || r.status === 410) return { s: 'removed' };
  if (!r.ok) return { s: 'unknown' };
  const h = await r.text(), u = (h.match(/href="\/users\/(\d+)"/) || [])[1]; // 出品者の番号（競合が何人いるかを数えるため。プロフィールは開かない）
  return { s: /取引が終了しました/.test(h) ? 'sold' : /購入する/.test(h) ? 'active' : 'pending', u };
}

const RUN = new Date().toISOString(), jst = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10), today = jst(Date.now()), daysAgo = n => jst(Date.now() - n * 864e5);
let state = { games: {} };
if (IN && existsSync(IN) && readFileSync(IN, 'utf8').trim()) { try { state = open(readFileSync(IN, 'utf8')); } catch (e) { console.error('前回の記録を開けませんでした（合言葉が違う？）'); process.exit(1); } }
state.since ??= today; state.runs = (state.runs || 0) + 1;
let totalSold = 0, totalChecked = 0, failed = 0;
for (const g of GAMES) {
  const G = state.games[g] ??= { since: today, L: {} }, L = G.L; // id → {u:出品者の番号, t:題名, x:説明文の頭（アカウント売り・アイテム売り、初期垢・育成垢などを見分ける）, p:値段, f:初めて見た日, l:最後に一覧で見た時刻, s:'active'|'old'|'sold'|'removed'|'pending', d:終わった日}
  let partial = false, seen = 0;
  for (let n = 1; n <= PAGES; n++) {
    const got = await listPage(g, n);
    if (got === null) { partial = true; break; }
    if (!got.length) break;
    for (const x of got) { const o = L[x.id]; seen++;
      if (o) { o.l = RUN; o.p = x.price; o.t = x.title; if (o.s !== 'active') { o.s = 'active'; delete o.d; } }
      else L[x.id] = { t: x.title, x: x.desc, p: x.price, f: today, l: RUN, s: 'active', n: G.since !== today }; } // n：記録を始めた日より後に見つけた（売れるまでの日数が分かる）
    await sleep(1000);
  }
  if (!seen) { failed++; continue; }
  // 一覧から消えた出品（新しいものから）と、前回「取引中」だった出品を確かめる。一覧を全部読めなかった回は消えた扱いにしない
  const gone = partial ? [] : Object.entries(L).filter(([, o]) => o.s === 'active' && o.l !== RUN).sort(([a], [b]) => +b - +a);
  const pend = Object.entries(L).filter(([, o]) => o.s === 'pending');
  let c = 0;
  for (const [id, o] of [...pend, ...gone].slice(0, CHECKS)) {
    const { s, u } = await detail(g, id); c++; if (u) o.u = u;
    if (s === 'sold') { o.s = 'sold'; o.d = today; totalSold++; }
    else if (s === 'removed') { o.s = 'removed'; o.d = today; }
    else if (s === 'active') o.s = 'old';  // 一覧の後ろに下がっただけ
    else if (s === 'pending') o.s = 'pending';
    await sleep(1000);
  }
  // 今出品している人の数を見積もるため、新しく見つけた出品を毎回少しだけ開いて出品者の番号を残す
  for (const [id, o] of Object.entries(L).filter(([, o]) => o.s === 'active' && o.l === RUN && o.f === today && !o.u).sort(([a], [b]) => +b - +a).slice(0, SAMPLE)) {
    const { s, u } = await detail(g, id); c++; if (u) o.u = u; if (s === 'sold') { o.s = 'sold'; o.d = today; totalSold++; }
    await sleep(1000);
  }
  G.unchecked = Object.values(L).filter(o => o.s === 'active' && o.l !== RUN).length; // 確かめきれなかった「消えた出品」の数（売れた数の見積もりに使う）
  totalChecked += c;
  for (const [id, o] of Object.entries(L)) if ((o.s !== 'active' && o.s !== 'pending') && (o.d || o.f) < daysAgo(21) || o.l < daysAgo(21)) delete L[id];
}
writeFileSync(OUT, seal(state) + '\n');
console.log(`調べ ${GAMES.length}本（読めなかった ${failed}本） / 確認 ${totalChecked}件（うち売れた ${totalSold}件） / ${state.runs}回目（${state.since}から）`);
