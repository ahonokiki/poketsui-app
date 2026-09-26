// 公式サイトの壁紙（https://www.pokecolotwin.jp/collection/#wallpaper）のいちばん新しいものを
// wallpaper/ に保存し、wallpaper.json に記録する。GitHub Actions で毎月実行（.github/workflows/wallpaper.yml）
import { writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
const API = 'https://pokecolotwin.wpcomstaging.com/wp-json/wp/v2/official-site-collections';
const res = await fetch(`${API}?type=wallpaper&per_page=1&order=desc`);
if (!res.ok) throw new Error(`取得失敗: ${res.status}`);
const [w] = await res.json();
if (!w) throw new Error('壁紙が見つかりません');
// 大きい画像を優先（なければ一覧用の thumbnail）
const urls = []; const walk = (v, k = '') => {
  if (typeof v === 'string' && /^https?:\/\/.+\.(jpe?g|png|webp)(\?|$)/i.test(v)) urls.push({ k, v });
  else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk); };
walk(w);
const pick = urls.find(u => !/thumb|second/i.test(u.k)) || urls.find(u => u.k === 'thumbnail') || urls[0];
if (!pick) throw new Error('画像のURLが見つかりません: ' + JSON.stringify(w).slice(0, 500));
const old = existsSync('wallpaper.json') ? JSON.parse(readFileSync('wallpaper.json', 'utf8')) : {};
if (old.source === pick.v) { console.log('変更なし'); process.exit(0); }
const ext = pick.v.match(/\.(jpe?g|png|webp)/i)[1].toLowerCase();
const file = `wallpaper/${w.year_month || new Date().toISOString().slice(0, 7)}.${ext}`;
const img = Buffer.from(await (await fetch(pick.v)).arrayBuffer());
for (const f of readdirSync('wallpaper')) rmSync('wallpaper/' + f); // 古い壁紙は消す
writeFileSync(file, img);
writeFileSync('wallpaper.json', JSON.stringify({ _説明: 'アプリの背景に使う公式壁紙（毎月自動更新）', image: file,
  title: typeof w.title === 'object' ? w.title.rendered : w.title, year_month: w.year_month, source: pick.v }, null, 2) + '\n');
console.log('更新:', file);
