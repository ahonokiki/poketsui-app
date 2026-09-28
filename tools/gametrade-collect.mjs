// ゲームトレード（ポケコロツイン）の出品一覧を集めて、アイテムごとの人気（いいね・出品数・価格）を集計する
// 使い方: node tools/gametrade-collect.mjs [出力先.json]
// ※ 集めたデータは利用規約上、公開しない（出力先はリポジトリの外か、暗号化して置く）
import { writeFileSync, readFileSync } from 'node:fs';
const BASE = 'https://gametrade.jp/pokekoro-twin/exhibits';
const UA = { 'User-Agent': 'Mozilla/5.0 (personal ranking; poketsui-app)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dec = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function page(sort, n) {
  const r = await fetch(`${BASE}?sort=${sort}&page=${n}`, { headers: UA }); if (!r.ok) return [];
  const h = await r.text(), out = [];
  // 出品ごとに {name,id,price} のデータと、その後ろのカードにある「×いいね数」を取る
  for (const m of h.matchAll(/name="exhibit_data" type="hidden" value="([^"]+)"[\s\S]*?<\/li><\/ul>[\s\S]*?<p>×(\d+)<\/p>/g)) {
    try { const d = JSON.parse(dec(m[1])); out.push({ id: d.id, title: d.name, price: +d.price, likes: +m[2] }); } catch (e) {}
  }
  return out;
}
const listings = new Map();
for (const [sort, pages] of [['thinking', 10], ['new', 10]]) {
  for (let n = 1; n <= pages; n++) { const got = await page(sort, n); got.forEach(x => listings.set(x.id, x)); await sleep(2000); if (!got.length) break; }
}
// タイトルからアイテム名を取り出す：アイテム名一覧の名前が含まれていればそれ（長いものを優先）、なければ飾りを外したタイトル
// ガチャ名：公式のお知らせの題名（【ガチャ】○○ 登場）と、アイテム名一覧のガチャ名
const gachas = new Set();
for (let off = 0; off < 3000; off += 100) {
  const r = await fetch(`https://pokecolotwin.wpcomstaging.com/wp-json/wp/v2/official-site-news?per_page=100&offset=${off}&order=desc`); if (!r.ok) break;
  const d = await r.json(); if (!d.length) break;
  for (const p of d) { const m = p.title.match(/^【[^】]+】\s*(.+?)\s*登場/); if (m) gachas.add(m[1]); }
  if (d.length < 100) break;
}
const itemsJson = JSON.parse(readFileSync(new URL('../items.json', import.meta.url)));
(itemsJson.items || []).forEach(x => x.g && gachas.add(x.g));
const gachaByLen = [...gachas].map(g => [g.normalize('NFKC').replace(/\s/g, ''), g]).filter(([k]) => k.length >= 4).sort((a, b) => b[0].length - a[0].length);
const names = itemsJson.names;
const norm = t => t.normalize('NFKC').replace(/\s/g, '');
const byLen = names.map(n => [norm(n), n]).filter(([k]) => k.length >= 4).sort((a, b) => b[0].length - a[0].length);
const clean = t => t.normalize('NFKC').replace(/【[^】]*】|「[^」]*」|\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, ' ')
  .replace(/双子分|1人分|2人分|一人分|即購入[可○⭕OK]*|最安値?|バラ売り?|原本|レプリカ|オリジナル品?|\d+点(セット)?|セット|まとめ|期間限定|お?値下げ中?|タイムセール中?|多分|専用|[\p{Extended_Pictographic}\uFE0F♡♥☆★]/gu, ' ')
  .replace(/\s+/g, ' ').trim().replace(/^[:：/／、,・+\-\s]+|[:：/／、,・+\-\s]+$/g, '');
function itemOf(title) { const t = norm(title);
  for (const [k, n] of byLen) if (t.includes(k)) return { name: n, known: true, kind: 'item' };
  // アイテム名が見つからず、ガチャ名そのものの出品は「ガチャのセット」
  for (const [k, g] of gachaByLen) if (t.includes(k)) return { name: g, known: true, kind: 'gacha' };
  return { name: clean(title) || title, known: false, kind: 'item' }; }
const agg = new Map();
for (const x of listings.values()) {
  // 問い合わせ用の仮の値段（123,456円・9999円など）や、たくさんのアイテムをまとめた出品は、アイテムの人気が分からないので除く
  if (x.price >= 30000 || /^(\d)\1{3,}$/.test(String(x.price))) continue;
  if (/ダブリ|まとめ|引退|一覧|リスト|福袋|詰め合わせ|バラ売|在庫|各種|何点でも|過去ガチャ|\d{4}年|月ガチャ|アカウント|垢|均一|相談|ハピ|all\s|\d+円|販売|ドリフェス|ココリウムセット|^ココリウム$/i.test(x.title)) continue;
  const { name, known, kind } = itemOf(x.title);
  const a = agg.get(kind + name) || { name, known, kind, likes: 0, count: 0, prices: [], titles: [] };
  a.likes += x.likes; a.count++; a.prices.push(x.price); if (a.titles.length < 3) a.titles.push(x.title); agg.set(kind + name, a);
}
const med = p => { const s = [...p].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const rows = [...agg.values()].map(a => ({ ...a, min: Math.min(...a.prices), median: med(a.prices), prices: undefined }))
  .sort((a, b) => b.likes - a.likes || b.count - a.count);
const out = { collected: new Date().toISOString(), listings: listings.size, rows };
writeFileSync(process.argv[2] || 'gametrade-ranking.json', JSON.stringify(out));
console.log(`出品 ${listings.size}件 → アイテム ${rows.length}種（一覧で名前が分かったもの ${rows.filter(r => r.known).length}種）`);
