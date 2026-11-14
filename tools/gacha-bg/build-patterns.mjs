// tools/pocodun-bg/*.js（背景の模様の関数）を1つにまとめて、アプリから読める bg-auto/patterns.js を作る
// ポケツイ・ポコダンは poketsui-app/bg-auto/patterns.js、ピグパは piggparty-app/bg-auto/patterns.js（隣にあれば写す）
// 使い方: node tools/gacha-bg/build-patterns.mjs   模様の関数を直したら、これをもう一度動かす（版 ver が変わり、アプリが作り直す）
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dir = path.dirname(new URL(import.meta.url).pathname), src = path.join(dir, '../pocodun-bg'), root = path.join(dir, '../..');
// 8種類（ポコダン設定の autoBg と同じ名前）
const LIST = [['pearl', '水彩画＋パールのキラキラ', 'pdWcPearl'], ['sparkle', 'キラキラ', 'pdSparkle'], ['bokeh', 'ぼかし＋光の玉', 'pdBokeh'], ['gradient', 'グラデーション', 'pdGradient'],
  ['aurora', 'オーロラ', 'pdAurora'], ['rays', '放射線', 'pdRays'], ['holo1', 'ホログラム＋ラメ', 'pdHolo1'], ['holo5', '星柄ホログラム', 'pdHolo5']];
const body = ['watercolor', 'wcpearl', 'sparkle', 'bokeh', 'gradient', 'more', 'holo'].map(f => `// ---- ${f}.js ----\n` + fs.readFileSync(path.join(src, f + '.js'), 'utf8').trim()).join('\n');
// canvas の filter（blur・saturate・brightness）が使えない端末（古い iPhone Safari など。代入が黙って無視される）用の代わり。
// 模様の関数の document.createElement('canvas') をこの中だけ差し替え、filter を自前の計算で行う（どの端末でも同じ見た目に近づける）
const SHIM = String.raw`// ---- canvas filter の代わり（使えない端末だけ） ----
const _doc=window.document;
// 本当に使えるか、小さく描いてぼけるかで確かめる（使えないと filter に代入しても値だけ残り、ぼけない）
const NATIVE=window.GachaPatNoFilter?false:(()=>{ try{ const c=_doc.createElement('canvas'); c.width=c.height=9; const g=c.getContext('2d'); g.filter='blur(2px)'; g.fillRect(4,4,1,1); return g.getImageData(2,4,1,1).data[3]>0; }catch(e){ return false; } })();
const _parse=f=>{ const L=[]; String(f||'none').replace(/([a-z-]+)\(([^)]*)\)/g,(_,k,v)=>{ L.push([k,parseFloat(v)||0]); }); return L.filter(([k,v])=>k==='blur'?v>0:(k==='saturate'||k==='brightness')&&v!==1); };
// ぼかし（3回の箱ぼかし≒ガウス）。a は透明度をかけた RGBA の Float32Array
function _box(a,w,h,r,tmp){ if (r<1) return; const n=2*r+1;
  for (let y=0;y<h;y++) for (let ch=0;ch<4;ch++){ let s=0; const o=y*w*4+ch; for (let i=-r;i<=r;i++) s+=i>=0&&i<w?a[o+i*4]:0;
    for (let x=0;x<w;x++){ tmp[o+x*4]=s/n; const i1=x+r+1, i0=x-r; s+=(i1<w?a[o+i1*4]:0)-(i0>=0?a[o+i0*4]:0); } }
  for (let x=0;x<w;x++) for (let ch=0;ch<4;ch++){ let s=0; const o=x*4+ch, st=w*4; for (let i=-r;i<=r;i++) s+=i>=0&&i<h?tmp[o+i*st]:0;
    for (let y=0;y<h;y++){ a[o+y*st]=s/n; const i1=y+r+1, i0=y-r; s+=(i1<h?tmp[o+i1*st]:0)-(i0>=0?tmp[o+i0*st]:0); } } }
function _gblur(a,w,h,sig){ const tmp=new Float32Array(a.length), wi=Math.sqrt(12*sig*sig/3+1); let wl=Math.floor(wi); if (wl%2===0) wl--; const m=Math.round((12*sig*sig-3*wl*wl-12*wl-9)/(-4*wl-4));
  for (let i=0;i<3;i++) _box(a,w,h,((i<m?wl:wl+2)-1)/2,tmp); }
// 描いた層（W×H、まわりに余白 M）に filter をかける。大きなぼかしは縮めてから（速さのため。画素は自前で平均・補間するので端末で差が出ない）
function _apply(lc,L,M){ const lg=lc.getContext('2d'), full=lg.getImageData(0,0,lc.width,lc.height).data;
  // 描いた所（透明でない所）＋ぼかしの広がり M だけを計算する（光の玉など小さな物を速く）
  let x0=1e9,y0=1e9,x1=-1,y1=-1; for (let y=0,i=3;y<lc.height;y++) for (let x=0;x<lc.width;x++,i+=4) if (full[i]){ if (x<x0) x0=x; if (x>x1) x1=x; if (y<y0) y0=y; if (y>y1) y1=y; }
  if (x1<0) return lc; x0=Math.max(0,x0-M); y0=Math.max(0,y0-M); x1=Math.min(lc.width-1,x1+M); y1=Math.min(lc.height-1,y1+M);
  const W=x1-x0+1,H=y1-y0+1, id=lg.getImageData(x0,y0,W,H), d=id.data; let a=new Float32Array(W*H*4);
  for (let i=0;i<d.length;i+=4){ const al=d[i+3]/255; a[i]=d[i]*al; a[i+1]=d[i+1]*al; a[i+2]=d[i+2]*al; a[i+3]=d[i+3]; }
  for (const [k,v] of L){
    if (k==='blur'){ const f=Math.max(1,Math.floor(v/3)); if (f===1){ _gblur(a,W,H,v); continue; }
      const w=Math.ceil(W/f), h=Math.ceil(H/f), b=new Float32Array(w*h*4);
      for (let y=0;y<H;y++) for (let x=0;x<W;x++){ const o=(y*W+x)*4, p=(((y/f)|0)*w+((x/f)|0))*4; b[p]+=a[o]; b[p+1]+=a[o+1]; b[p+2]+=a[o+2]; b[p+3]+=a[o+3]; }
      for (let i=0;i<b.length;i++) b[i]/=f*f; _gblur(b,w,h,v/f);
      for (let y=0;y<H;y++){ let fy=(y+.5)/f-.5; fy=Math.max(0,Math.min(h-1,fy)); const y0=fy|0, y1=Math.min(h-1,y0+1), ty=fy-y0;
        for (let x=0;x<W;x++){ let fx=(x+.5)/f-.5; fx=Math.max(0,Math.min(w-1,fx)); const x0=fx|0, x1=Math.min(w-1,x0+1), tx=fx-x0, o=(y*W+x)*4;
          for (let ch=0;ch<4;ch++){ const p00=b[(y0*w+x0)*4+ch], p01=b[(y0*w+x1)*4+ch], p10=b[(y1*w+x0)*4+ch], p11=b[(y1*w+x1)*4+ch];
            a[o+ch]=(p00+(p01-p00)*tx)*(1-ty)+(p10+(p11-p10)*tx)*ty; } } }
      continue; }
    // 彩度・明るさ（CSS の filter と同じ式）。透明度をかけたままでも同じ計算でよい（色の一次式なので）
    const s=v, M3=k==='saturate'?[.213+.787*s,.715-.715*s,.072-.072*s,.213-.213*s,.715+.285*s,.072-.072*s,.213-.213*s,.715-.715*s,.072+.928*s]:[v,0,0,0,v,0,0,0,v];
    for (let i=0;i<a.length;i+=4){ const r=a[i],g=a[i+1],bb=a[i+2],al=a[i+3]; a[i]=Math.min(al,Math.max(0,M3[0]*r+M3[1]*g+M3[2]*bb)); a[i+1]=Math.min(al,Math.max(0,M3[3]*r+M3[4]*g+M3[5]*bb)); a[i+2]=Math.min(al,Math.max(0,M3[6]*r+M3[7]*g+M3[8]*bb)); } }
  for (let i=0;i<d.length;i+=4){ const al=a[i+3]; d[i+3]=Math.round(al); const k=al>0?255/al:0; d[i]=Math.round(a[i]*k); d[i+1]=Math.round(a[i+1]*k); d[i+2]=Math.round(a[i+2]*k); }
  lg.putImageData(id,x0,y0); return lc; }
// filter が使えない端末で、ctx の filter・save/restore・パス・描く命令を差し替える
const PATH=['beginPath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','arcTo','ellipse','rect','closePath'], COPY=['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','miterLimit','imageSmoothingEnabled','imageSmoothingQuality'];
function _hook(g){ const raw={}; let filt='none'; const stack=[], path=[];
  for (const k of ['save','restore','drawImage','fill','stroke','fillRect',...PATH]) raw[k]=g[k].bind(g);
  Object.defineProperty(g,'filter',{configurable:true,get:()=>filt,set:v=>{ filt=String(v); }});
  g.save=()=>{ stack.push(filt); raw.save(); }; g.restore=()=>{ if (stack.length) filt=stack.pop(); raw.restore(); };
  for (const k of PATH) g[k]=(...a)=>{ if (k==='beginPath') path.length=0; else path.push([k,a,g.getTransform()]); raw[k](...a); };
  const layer=(op,args)=>{ const L=_parse(filt); if (!L.length) return raw[op](...args);
    const sig=L.reduce((m,[k,v])=>k==='blur'?Math.max(m,v):m,0), M=Math.ceil(sig*3), cv=g.canvas, lc=_doc.createElement('canvas'); lc.width=cv.width+2*M; lc.height=cv.height+2*M;
    const lg=lc.getContext('2d',{willReadFrequently:true}); for (const k of COPY) lg[k]=g[k];
    const sh=t=>{ lg.setTransform(new DOMMatrix([1,0,0,1,M,M]).multiply(t)); };
    if (op==='fill'||op==='stroke'){ lg.beginPath(); for (const [k,a,t] of path){ sh(t); lg[k](...a); } }
    sh(g.getTransform()); lg[op](...args); _apply(lc,L,M);
    // 層を、今の透明度・重ね方のまま元の位置に描く（filter はかけ終わっているので素の drawImage）
    raw.save(); g.setTransform(1,0,0,1,0,0); raw.drawImage(lc,-M,-M); raw.restore(); };
  g.drawImage=(...a)=>layer('drawImage',a); g.fill=(...a)=>layer('fill',a); g.stroke=(...a)=>layer('stroke',a); g.fillRect=(...a)=>layer('fillRect',a);
  return g; }
const document=NATIVE?_doc:{ createElement(t){ const e=_doc.createElement(t); if (String(t).toLowerCase()==='canvas'){ const gc=e.getContext.bind(e); let h=null; e.getContext=(k,o)=>{ const g=gc(k,o); return k==='2d'&&g?(h||(h=_hook(g))):g; }; } return e; } };
`;
const make = ver => `// ガチャ背景の模様8種類（自動で作ったファイル。直すときは tools/pocodun-bg/*.js を直して tools/gacha-bg/build-patterns.mjs を動かす）
// 使い方: GachaPat.make(img, 'pearl', 1080) → canvas。img は Image か canvas（bg-auto/ の縮小jpg）。丸い枠の見本は GachaPat.thumb(img, 'pearl', 128)
// GachaPat.list = [{key, name}]、GachaPat.ver = 模様の版（IndexedDB にためるときの名前に入れる）。種（seed=7）が決まっているので、同じ画像ならどの端末でも同じ模様
(function(){
${SHIM}
${body}
// ---- まとめ ----
const FN={${LIST.map(([k, , f]) => `${k}:${f}`).join(',')}};
window.GachaPat={ ver:'${ver}', native:NATIVE, list:${JSON.stringify(LIST.map(([key, name]) => ({ key, name })))},
  make(img,key,S=1080){ return (FN[key]||FN.pearl)(img,S,7); },
  // 丸い枠用の小さな見本。ラメの数は大きさで変わらないので、小さく作ると粒だらけになる→540で作って縮める
  thumb(img,key,S=128){ const b=this.make(img,key,540), c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d'); g.imageSmoothingQuality='high'; g.drawImage(b,0,0,S,S); return c; } };
})();
`;
const ver = createHash('sha1').update(make('')).digest('hex').slice(0, 8), out = make(ver); // 模様の版：関数が変わると変わる
const dests = [path.join(root, 'bg-auto/patterns.js'), path.join(root, '../piggparty-app/bg-auto/patterns.js')];
for (const f of dests) { if (!fs.existsSync(path.dirname(path.dirname(f)))) continue; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, out); console.log('作成', f, 'ver', ver); }
