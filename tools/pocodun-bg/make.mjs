// 新しいガチャの画像から、自動の背景6種類をまとめて作る（1回作ったら次のガチャまで使い回す）
// 使い方: node tools/pocodun-bg/make.mjs ガチャ画像.png
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
const { chromium } = createRequire(import.meta.url)('playwright');
const dir=path.dirname(new URL(import.meta.url).pathname), out=path.join(dir,'../../pocodun');
const js=['watercolor','wcpearl','sparkle','bokeh','gradient','stained'].map(f=>fs.readFileSync(path.join(dir,f+'.js'),'utf8')).join('\n');
const jobs={'bg_auto.jpg':'pdWatercolor','bg_auto_pearl.jpg':'pdWcPearl','bg_auto_sparkle.jpg':'pdSparkle','bg_auto_bokeh.jpg':'pdBokeh','bg_auto_gradient.jpg':'pdGradient','bg_auto_stained.jpg':'pdStained'};
const b=await chromium.launch(); const p=await b.newPage(); await p.setContent('<html><body></body></html>'); await p.addScriptTag({content:js});
const src='data:image/png;base64,'+fs.readFileSync(process.argv[2]).toString('base64');
for (const [f,fn] of Object.entries(jobs)){ const u=await p.evaluate(async ([src,fn])=>{ const i=new Image(); i.src=src; await i.decode(); return window[fn](i).toDataURL('image/jpeg',.88); },[src,fn]);
  fs.writeFileSync(path.join(out,f),Buffer.from(u.split(',')[1],'base64')); console.log('作成',f); }
await b.close();
