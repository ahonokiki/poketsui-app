// ガチャ背景の模様8種類（自動で作ったファイル。直すときは tools/pocodun-bg/*.js を直して tools/gacha-bg/build-patterns.mjs を動かす）
// 使い方: GachaPat.make(img, 'pearl', 1080) → canvas。img は Image か canvas（bg-auto/ の縮小jpg）。丸い枠の見本は GachaPat.thumb(img, 'pearl', 128)
// GachaPat.list = [{key, name}]、GachaPat.ver = 模様の版（IndexedDB にためるときの名前に入れる）。種（seed=7）が決まっているので、同じ画像ならどの端末でも同じ模様
(function(){
// ---- canvas filter の代わり（使えない端末だけ） ----
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

// ---- watercolor.js ----
// 画像を「粗いピクセル→水彩画」にして背景を作る。絵の形は残さず、色の配置だけを使う
function pdWatercolor(img, S=1080, seed=7){
  let r=seed>>>0; const rnd=()=>((r=(r*1664525+1013904223)>>>0)/4294967296);
  // 1) 16×16 マスの色
  const N=16, sm=document.createElement('canvas'); sm.width=sm.height=N; const sg=sm.getContext('2d',{willReadFrequently:true});
  sg.imageSmoothingQuality='high'; sg.drawImage(img,0,0,N,N); // 絵全体の色の配置を使う（横長の絵もそのまま正方形に）
  const px=sg.getImageData(0,0,N,N).data;
  // 色は明るく・あざやかに（水彩は紙の白がすける）
  const lift=([R,G,B])=>{ const m=(R+G+B)/3, s=1.7; let c=[R,G,B].map(v=>Math.max(0,Math.min(255,m+(v-m)*s))); return c.map(v=>Math.round(v+(255-v)*.12)); };
  const col=(x,y)=>{ const i=(Math.min(N-1,Math.max(0,y|0))*N+Math.min(N-1,Math.max(0,x|0)))*4; return lift([px[i],px[i+1],px[i+2]]); };
  for (let i=0;i<px.length;i+=4){ const c=lift([px[i],px[i+1],px[i+2]]); px[i]=c[0]; px[i+1]=c[1]; px[i+2]=c[2]; } sg.putImageData(new ImageData(px,N,N),0,0);
  const c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d');
  // 2) 下塗り：マスの色をうすく大きくにじませる
  g.fillStyle='#fffdf8'; g.fillRect(0,0,S,S);
  g.save(); g.filter=`blur(${S/14}px)`; g.globalAlpha=.85; g.imageSmoothingEnabled=true; g.drawImage(sm,-S*.1,-S*.1,S*1.2,S*1.2); g.restore();
  // 3) 絵の具のしみ：ふちがでこぼこの丸を、すけた色で何層も重ねる（ふちは少し濃く＝水彩のたまり）
  const blob=(cx,cy,rad,[R,G,B])=>{ const n=28, pts=[]; let a0=rnd()*6.28;
    for (let i=0;i<n;i++){ const a=a0+i/n*6.283, q=rad*(.75+rnd()*.5); pts.push([cx+Math.cos(a)*q, cy+Math.sin(a)*q]); }
    for (let layer=0;layer<3;layer++){ g.beginPath(); const J=pts.map(([x,y])=>[x+(rnd()-.5)*rad*.16, y+(rnd()-.5)*rad*.16]); const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2]; let m0=mid(J[n-1],J[0]); g.moveTo(m0[0],m0[1]);
      for (let i=0;i<n;i++){ const p=J[i], q=mid(p,J[(i+1)%n]); g.quadraticCurveTo(p[0],p[1],q[0],q[1]); } g.closePath();
      g.fillStyle=`rgba(${R},${G},${B},${.12+rnd()*.06})`; g.fill(); g.lineWidth=S/500+rnd()*S/600; g.strokeStyle=`rgba(${R*.82|0},${G*.82|0},${B*.82|0},${.07+rnd()*.06})`; g.stroke(); } };
  for (let t=0;t<170;t++){ const x=rnd()*S, y=rnd()*S; blob(x,y,S*(.05+rnd()*.11), col(x/S*N,y/S*N)); }
  // 4) 紙の質感とにじみ
  const tex=document.createElement('canvas'); tex.width=tex.height=S/2; const tg=tex.getContext('2d'); const id=tg.createImageData(S/2,S/2);
  for (let i=0;i<id.data.length;i+=4){ const v=128+(rnd()-.5)*38; id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255; } tg.putImageData(id,0,0);
  g.save(); g.globalCompositeOperation='soft-light'; g.globalAlpha=.35; g.filter='blur(.6px)'; g.drawImage(tex,0,0,S,S); g.restore();
  return c;
}
// ---- wcpearl.js ----
// 水彩画＋パール：水彩画の上に、パールの虹色のツヤ（ゆるい光の帯）と細かいラメ・小さなキラッを重ねる
function pdWcPearl(img, S=1080, seed=7){
  const c=pdWatercolor(img,S,seed), g=c.getContext('2d');
  let r=(seed*7919+13)>>>0; const rnd=()=>((r=(r*1664525+1013904223)>>>0)/4294967296);
  // パールの虹色のツヤ：斜めにゆるく波打つ光の帯
  g.save(); g.globalCompositeOperation='soft-light';
  for (let k=0;k<3;k++){ const a=rnd()*Math.PI, x=S/2+Math.cos(a)*S*.6, y=S/2+Math.sin(a)*S*.6; const gr=g.createLinearGradient(x,y,S-x,S-y);
    ['#ffd6f3','#d4f6ff','#fff4c2','#e6d8ff','#d2ffec','#ffd6f3'].forEach((cc,i)=>gr.addColorStop(i/5,cc)); g.globalAlpha=.35; g.fillStyle=gr; g.fillRect(0,0,S,S); }
  g.restore();
  // パールの白い光沢（ふんわりした明るい帯）
  g.save(); g.globalCompositeOperation='screen'; g.filter=`blur(${S/30}px)`;
  for (let k=0;k<4;k++){ g.beginPath(); const y0=rnd()*S; g.moveTo(-50,y0); g.bezierCurveTo(S*.3,y0+(rnd()-.5)*S*.4,S*.7,y0+(rnd()-.5)*S*.4,S+50,y0+(rnd()-.5)*S*.3); g.lineWidth=S*(.03+rnd()*.05); g.strokeStyle='rgba(255,255,255,.22)'; g.stroke(); }
  g.restore();
  // ラメ（細かい粒）と小さなキラッ
  g.save(); g.globalCompositeOperation='lighter';
  for (let k=0;k<2200;k++){ const x=rnd()*S, y=rnd()*S, s=rnd()*1.5+.3, h=rnd(); g.fillStyle=h<.33?`rgba(255,220,245,${.25+rnd()*.5})`:h<.66?`rgba(215,245,255,${.25+rnd()*.5})`:`rgba(255,245,210,${.25+rnd()*.5})`; g.fillRect(x,y,s,s); }
  // キラッ：細く長い十字の光（中心は小さく）
  for (let k=0;k<30;k++){ const x=rnd()*S, y=rnd()*S, l=S*(.008+rnd()*.018), w=.8+rnd()*.8;
    const gr=g.createRadialGradient(x,y,0,x,y,l*.35); gr.addColorStop(0,'rgba(255,255,255,.95)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.beginPath(); g.arc(x,y,l*.35,0,7); g.fill();
    for (const [dx,dy,L] of [[1,0,l],[0,1,l],[.7,.7,l*.45],[.7,-.7,l*.45]]){ const lg=g.createLinearGradient(x-dx*L,y-dy*L,x+dx*L,y+dy*L); lg.addColorStop(0,'rgba(255,255,255,0)'); lg.addColorStop(.5,'rgba(255,255,255,.9)'); lg.addColorStop(1,'rgba(255,255,255,0)');
      g.strokeStyle=lg; g.lineWidth=w; g.beginPath(); g.moveTo(x-dx*L,y-dy*L); g.lineTo(x+dx*L,y+dy*L); g.stroke(); } }
  // 少し大きめのラメ粒
  for (let k=0;k<260;k++){ const x=rnd()*S, y=rnd()*S, rr=1+rnd()*1.8; g.fillStyle=`rgba(255,255,255,${.35+rnd()*.45})`; g.beginPath(); g.arc(x,y,rr,0,7); g.fill(); }
  g.restore(); return c;
}
// ---- sparkle.js ----
// キラキラ背景：ガチャの色を大きくぼかした明るい色の面＋ホログラムの虹色のゆらぎ＋光の筋・レンズフレア＋細かいラメ＋大小の4本光の星
function pdSparkle(img, S=1080, seed=7){
  let r=seed>>>0; const rnd=()=>((r=(r*1664525+1013904223)>>>0)/4294967296);
  const N=12, sm=document.createElement('canvas'); sm.width=sm.height=N; const sg=sm.getContext('2d',{willReadFrequently:true});
  sg.imageSmoothingQuality='high'; sg.drawImage(img,0,0,N,N); const px=sg.getImageData(0,0,N,N).data;
  // 色を少し鮮やかに、そして明るいパステル寄りに
  for (let i=0;i<px.length;i+=4){ const R=px[i],G=px[i+1],B=px[i+2], m=(R+G+B)/3;
    for (let k=0;k<3;k++){ let v=m+([R,G,B][k]-m)*2.0; v=v+(255-v)*.18; px[i+k]=Math.max(0,Math.min(255,v)); } }
  sg.putImageData(new ImageData(px,N,N),0,0);
  const c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d');
  // 下地：色の面を大きくぼかす
  g.fillStyle='#f4e8f6'; g.fillRect(0,0,S,S);
  g.save(); g.filter=`blur(${S/16}px) saturate(1.25)`; g.drawImage(sm,-S*.12,-S*.12,S*1.24,S*1.24); g.restore();
  // やわらかい光のぼかし玉（ボケ）
  g.save(); g.globalCompositeOperation='screen';
  for (let k=0;k<16;k++){ const x=rnd()*S, y=rnd()*S, R=S*(.03+rnd()*.06); const gr=g.createRadialGradient(x,y,0,x,y,R);
    gr.addColorStop(0,`rgba(255,255,255,${.12+rnd()*.18})`); gr.addColorStop(.75,`rgba(255,255,255,${.05+rnd()*.06})`); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.beginPath(); g.arc(x,y,R,0,7); g.fill(); }
  g.restore();
  // ホログラムの虹色のゆらぎ（斜めの帯をぼかして重ねる）
  g.save(); g.globalCompositeOperation='soft-light'; g.globalAlpha=.35; g.filter=`blur(${S/18}px)`;
  const hol=['#ff9fe0','#9fe8ff','#fff3a0','#c8a8ff','#ffd0f0'];
  for (let k=0;k<7;k++){ const a=-.6+(rnd()-.5)*.3, cx=rnd()*S, cy=rnd()*S, w=S*(.08+rnd()*.12);
    g.save(); g.translate(cx,cy); g.rotate(a); const lg=g.createLinearGradient(0,-w,0,w);
    for (let j=0;j<5;j++) lg.addColorStop(j/4,hol[(j+k)%5]); g.fillStyle=lg; g.fillRect(-S*1.2,-w,S*2.4,w*2); g.restore(); }
  g.restore();
  // 光の筋（斜めのやわらかい光線、両端は消える）
  const ang=-.55+(rnd()-.5)*.2;
  for (let k=0;k<4;k++){ const cx=S*(.15+rnd()*.7), cy=S*(.15+rnd()*.7), w=S*(.003+rnd()*.02), L=S*(.3+rnd()*.35), a=.25+rnd()*.25;
    const t=document.createElement('canvas'); t.width=Math.ceil(L*2); t.height=Math.ceil(w*2); const tg=t.getContext('2d');
    const lg=tg.createLinearGradient(0,0,0,w*2); lg.addColorStop(0,'rgba(255,255,255,0)'); lg.addColorStop(.5,`rgba(255,250,240,${a})`); lg.addColorStop(1,'rgba(255,255,255,0)');
    tg.fillStyle=lg; tg.fillRect(0,0,L*2,w*2); tg.globalCompositeOperation='destination-in';
    const fd=tg.createLinearGradient(0,0,L*2,0); fd.addColorStop(0,'rgba(0,0,0,0)'); fd.addColorStop(.5,'#000'); fd.addColorStop(1,'rgba(0,0,0,0)'); tg.fillStyle=fd; tg.fillRect(0,0,L*2,w*2);
    g.save(); g.globalCompositeOperation='screen'; g.translate(cx,cy); g.rotate(ang); g.drawImage(t,-L,-w); g.restore(); }
  // ラメ（細かい粒）
  const id=g.getImageData(0,0,S,S), d=id.data;
  for (let k=0;k<S*S*.012;k++){ const x=rnd()*S|0, y=rnd()*S|0, i=(y*S+x)*4, a=.25+rnd()*.7, t=rnd();
    const cc=t<.55?[255,255,255]:t<.75?[255,236,170]:t<.88?[255,200,240]:[190,240,255];
    for (let q=0;q<3;q++) d[i+q]=Math.min(255,d[i+q]+(cc[q]-d[i+q])*a);
    if (rnd()<.25 && x<S-1){ const j=i+4; for (let q=0;q<3;q++) d[j+q]=Math.min(255,d[j+q]+(cc[q]-d[j+q])*a*.6); } }
  g.putImageData(id,0,0);
  // 4本光の星
  const star=(x,y,l,a,rot,tint)=>{
    g.save(); g.translate(x,y); g.rotate(rot);
    const gl=g.createRadialGradient(0,0,0,0,0,l*.45); gl.addColorStop(0,`rgba(255,255,255,${a})`); gl.addColorStop(.3,`rgba(${tint},${a*.4})`); gl.addColorStop(1,`rgba(${tint},0)`);
    g.fillStyle=gl; g.beginPath(); g.arc(0,0,l*.45,0,7); g.fill();
    g.fillStyle=`rgba(${tint},${a})`; const w=Math.max(.8,l*.07);
    for (let k=0;k<4;k++){ const L=k%2?l*.75:l; g.beginPath(); g.moveTo(0,-w); g.quadraticCurveTo(L*.15,-w*.2,L,0); g.quadraticCurveTo(L*.15,w*.2,0,w); g.closePath(); g.fill(); g.rotate(Math.PI/2); }
    g.restore(); };
  g.save(); g.globalCompositeOperation='lighter';
  const tints=['255,240,190','255,210,245','200,240,255','255,255,255'];
  for (let k=0;k<85;k++) star(rnd()*S,rnd()*S,S*(.008+rnd()*.01),.5+rnd()*.4,(rnd()-.5)*.3,tints[rnd()*4|0]);
  for (let k=0;k<24;k++) star(rnd()*S,rnd()*S,S*(.02+rnd()*.022),.6+rnd()*.35,(rnd()-.5)*.25,tints[rnd()*4|0]);
  for (let k=0;k<6;k++) star(rnd()*S,rnd()*S,S*(.05+rnd()*.035),.85,(rnd()-.5)*.2,tints[rnd()*4|0]);
  g.restore();
  // レンズフレア（明るい点から、線上に色付きの輪）
  g.save(); g.globalCompositeOperation='screen';
  const fx=S*(.12+rnd()*.2), fy=S*(.08+rnd()*.15);
  const fg=g.createRadialGradient(fx,fy,0,fx,fy,S*.22); fg.addColorStop(0,'rgba(255,255,255,.75)'); fg.addColorStop(.15,'rgba(255,245,220,.35)'); fg.addColorStop(1,'rgba(255,240,220,0)');
  g.fillStyle=fg; g.beginPath(); g.arc(fx,fy,S*.22,0,7); g.fill();
  const vx=S*.5-fx, vy=S*.55-fy;
  [[.5,.03,'190,240,255'],[.8,.015,'255,220,180'],[1.15,.05,'230,200,255'],[1.45,.025,'200,255,230'],[1.7,.07,'255,210,240']].forEach(([t,R,cc])=>{
    const x=fx+vx*t, y=fy+vy*t, rr=S*R, gr=g.createRadialGradient(x,y,rr*.55,x,y,rr);
    gr.addColorStop(0,`rgba(${cc},.06)`); gr.addColorStop(.85,`rgba(${cc},.22)`); gr.addColorStop(1,`rgba(${cc},0)`); g.fillStyle=gr; g.beginPath(); g.arc(x,y,rr,0,7); g.fill(); });
  g.restore();
  star(fx,fy,S*.11,.95,.1,'255,245,220');
  return c;
}
// ---- bokeh.js ----
// ぼかし＋光の玉（玉ボケ）の背景：ガチャの色の配置だけを大きくぼかした色の場に、パレット色の丸い光の玉を加算合成で重ねる
function pdBokeh(img, S=1080, seed=7){
  let r=seed>>>0; const rnd=()=>((r=(r*1664525+1013904223)>>>0)/4294967296);
  const N=16, sm=document.createElement('canvas'); sm.width=sm.height=N; const sg=sm.getContext('2d',{willReadFrequently:true});
  sg.imageSmoothingQuality='high'; sg.drawImage(img,0,0,N,N); const px=sg.getImageData(0,0,N,N).data;
  const pal=[]; for (let i=0;i<px.length;i+=4){ const R=px[i],G=px[i+1],B=px[i+2], m=(R+G+B)/3, s=1.9; pal.push([R,G,B].map(v=>Math.round(Math.max(0,Math.min(255,m+(v-m)*s))))); }
  const col=(x,y)=>pal[Math.min(N-1,Math.max(0,(y/S*N)|0))*N+Math.min(N-1,Math.max(0,(x/S*N)|0))];
  const mix=(c,w,t)=>c.map((v,i)=>Math.round(v+(w[i]-v)*t)), rgb=(c,a=1)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d');
  // 下地：色の配置を強くぼかし、少し明るく
  g.fillStyle=rgb(pal[(N*N/2)|0]); g.fillRect(0,0,S,S);
  g.save(); g.filter=`blur(${S/14}px) saturate(1.35) brightness(1.08)`; g.drawImage(sm,-S*.12,-S*.12,S*1.24,S*1.24); g.restore();
  // 暗い元絵でも明るい背景になるよう、平均の明るさが低いときは白を screen で持ち上げる
  const avg=pal.reduce((t,c)=>t+(c[0]+c[1]+c[2])/765,0)/pal.length;
  if (avg<.55){ g.save(); g.globalCompositeOperation='screen'; g.fillStyle=`rgba(255,248,240,${Math.min(.45,(.55-avg)*1.1)})`; g.fillRect(0,0,S,S); g.restore(); }
  // やわらかな光のもや（中央上寄り）と、四隅をわずかに沈める
  let gr=g.createRadialGradient(S*.5,S*.35,0,S*.5,S*.35,S*.75); gr.addColorStop(0,'rgba(255,255,255,.18)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,S,S);
  gr=g.createRadialGradient(S/2,S/2,S*.45,S/2,S/2,S*.78); gr.addColorStop(0,'rgba(40,20,60,0)'); gr.addColorStop(1,'rgba(40,20,60,.15)'); g.fillStyle=gr; g.fillRect(0,0,S,S);
  // 玉ボケ：奥（大きく淡くぼけた）→手前（小さくはっきり）の3層
  const orb=(x,y,R,a,rim,blur)=>{ const src=col(x,y), lum=(src[0]+src[1]+src[2])/765; a*=1.25-lum*.75; // 明るい所は白飛びしないよう控えめに
    const base=mix(src,[255,255,255],.1+rnd()*.18);
    g.save(); if (blur) g.filter=`blur(${blur}px)`;
    const o=g.createRadialGradient(x,y,0,x,y,R);
    o.addColorStop(0,rgb(base,a*.5)); o.addColorStop(.75,rgb(base,a*.7)); o.addColorStop(.93,rgb(mix(base,[255,255,255],.35*rim),a*(.85+rim*.9))); o.addColorStop(1,rgb(base,0));
    g.fillStyle=o; g.beginPath(); g.arc(x,y,R,0,6.2832); g.fill();
    if (rim>.6 && !blur){ g.strokeStyle=rgb(mix(base,[255,255,255],.5),a*.5); g.lineWidth=Math.max(1,R*.03); g.beginPath(); g.arc(x,y,R*.95,0,6.2832); g.stroke(); }
    g.restore(); };
  g.save(); g.globalCompositeOperation='lighter';
  for (let k=0;k<10;k++) orb(rnd()*S,rnd()*S,S*(.09+rnd()*.08),.07+rnd()*.06,rnd()*.4,S*.012);
  for (let k=0;k<24;k++) orb(rnd()*S,rnd()*S,S*(.035+rnd()*.05),.08+rnd()*.10,.3+rnd()*.7,rnd()<.5?S*.003:0);
  for (let k=0;k<30;k++) orb(rnd()*S,rnd()*S,S*(.008+rnd()*.018),.15+rnd()*.2,.5+rnd()*.5,0);
  // ちいさな光の粒
  for (let k=0;k<90;k++){ const x=rnd()*S,y=rnd()*S,l=S*(.002+rnd()*.004); const p=g.createRadialGradient(x,y,0,x,y,l*2.5); p.addColorStop(0,`rgba(255,250,235,${.3+rnd()*.45})`); p.addColorStop(1,'rgba(255,250,235,0)'); g.fillStyle=p; g.fillRect(x-l*3,y-l*3,l*6,l*6); }
  g.restore();
  return c;
}
// ---- gradient.js ----
// グラデーション背景：ガチャの色から鮮やかな代表色を3〜4色取り出し（k-means）、その色があった位置に大きな放射グラデーションを重ねたメッシュ風グラデーション＋斜めの柔らかい光＋ごく弱い粒子
function pdGradient(img, S=1080, seed=7){
  let r=seed>>>0; const rnd=()=>((r=(r*1664525+1013904223)>>>0)/4294967296);
  const N=16, sm=document.createElement('canvas'); sm.width=sm.height=N; const sg=sm.getContext('2d',{willReadFrequently:true});
  sg.imageSmoothingQuality='high'; sg.drawImage(img,0,0,N,N); const px=sg.getImageData(0,0,N,N).data;
  // 各マスの色相・彩度・明るさ
  const hsl=c=>{ const [R,G,B]=c.map(v=>v/255), mx=Math.max(R,G,B), mn=Math.min(R,G,B), d=mx-mn, l=(mx+mn)/2; let h=0;
    if (d>1e-6){ h=mx===R?((G-B)/d)%6:mx===G?(B-R)/d+2:(R-G)/d+4; h/=6; if (h<0) h+=1; } return [h, d<1e-6?0:d/(1-Math.abs(2*l-1)), l]; };
  const pts=[]; for (let i=0;i<N*N;i++){ const c=[px[i*4],px[i*4+1],px[i*4+2]], [h,s,l]=hsl(c);
    pts.push({h,s,l,x:(i%N+.5)/N,y:(((i/N)|0)+.5)/N,w:s*s*Math.max(0,1-Math.abs(l-.55)/.42)}); }
  // 色相のヒストグラムから、離れた山を3〜4個選ぶ（＝目立つ鮮やかな色）
  const HB=36, hist=new Float32Array(HB); for (const p of pts) hist[(p.h*HB|0)%HB]+=p.w;
  const sm3=hist.map((v,i)=>hist[(i+HB-1)%HB]*.5+v+hist[(i+1)%HB]*.5);
  const order=[...sm3.keys()].sort((a,b)=>sm3[b]-sm3[a]), peaks=[], hd=(a,b)=>{ const d=Math.abs(a-b)%1; return Math.min(d,1-d); };
  for (const i of order){ const h=(i+.5)/HB; if (sm3[i]<sm3[order[0]]*.06) break; if (peaks.every(q=>hd(q,h)>.1)) peaks.push(h); if (peaks.length===4) break; }
  while (peaks.length<3) peaks.push(((peaks[0]??.8)+.12*peaks.length)%1);
  // 山ごとに、その色が多い場所（重心）を求める
  const vivid=(h,s,l)=>{ const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q, f=t=>{ t=(t%1+1)%1; return t<1/6?p+(q-p)*6*t:t<.5?q:t<2/3?p+(q-p)*(2/3-t)*6:p; };
    return [f(h+1/3),f(h),f(h-1/3)].map(v=>Math.round(v*255)); };
  const pal=peaks.map((h,k)=>{ let x=0,y=0,w=0,ss=0; for (const p of pts){ const a=Math.max(0,1-hd(p.h,h)/.06)*p.w; const a4=a*a; x+=p.x*a4; y+=p.y*a4; w+=a4; ss+=p.s*a; }
    if (w<1e-9){ x=rnd(); y=rnd(); w=1e-9; } return {h,c:vivid(h,.86,.72),x:x/w,y:y/w}; });
  const rgb=(c,a=1)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`, mix=(c,w,t)=>c.map((v,i)=>Math.round(v+(w[i]-v)*t));
  const c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d');
  // 色の点を外側へ広げ（重心は中央に寄りがちなので）、互いに近すぎる点は押し離す
  for (const p of pal){ let dx=p.x-.5, dy=p.y-.5; const L=Math.hypot(dx,dy)||1e-3; const tgt=.3+rnd()*.12; p.x=.5+dx/L*Math.max(L*1.6,tgt); p.y=.5+dy/L*Math.max(L*1.6,tgt); }
  for (let it=0;it<60;it++) for (const p of pal) for (const q of pal){ if (p===q) continue; const dx=p.x-q.x, dy=p.y-q.y, d=Math.hypot(dx,dy)||1e-3; if (d<.62){ const f=(.62-d)*.1; p.x+=dx/d*f; p.y+=dy/d*f; } }
  for (const p of pal){ p.x=Math.min(1.05,Math.max(-.05,p.x)); p.y=Math.min(1.05,Math.max(-.05,p.y)); }
  // 白に近い明るい点を中央寄りに1つ足して、全体を明るく抜けよく
  const pts2=pal.concat([{c:[255,250,252],x:.5+(rnd()-.5)*.2,y:.42+(rnd()-.5)*.15,k:.22}]);
  // メッシュ・グラデーション（距離の逆数で各点の色を滑らかに混ぜる）を小さく計算して拡大
  const M=96, mc=document.createElement('canvas'); mc.width=mc.height=M; const mg=mc.getContext('2d'); const md=mg.createImageData(M,M);
  const lin=v=>(v/255)**2.2, gam=v=>Math.round(255*Math.max(0,Math.min(1,v))**(1/2.2));
  const L2=pts2.map(p=>p.c.map(lin));
  for (let j=0;j<M;j++) for (let i=0;i<M;i++){ const x=(i+.5)/M, y=(j+.5)/M; let R=0,G=0,B=0,W=0;
    pts2.forEach((p,k)=>{ const d=(x-p.x)**2+(y-p.y)**2; const w=(p.k??1)/Math.pow(d+.05,1.5); R+=L2[k][0]*w; G+=L2[k][1]*w; B+=L2[k][2]*w; W+=w; });
    const o=(j*M+i)*4; md.data[o]=gam(R/W); md.data[o+1]=gam(G/W); md.data[o+2]=gam(B/W); md.data[o+3]=255; }
  mg.putImageData(md,0,0);
  g.imageSmoothingQuality='high'; g.save(); g.filter=`blur(${S/60}px)`; g.drawImage(mc,-S*.03,-S*.03,S*1.06,S*1.06); g.restore();
  // 斜めの柔らかい光（左上→右下の帯）
  g.save(); g.globalCompositeOperation='soft-light';
  const sh=g.createLinearGradient(0,0,S,S); sh.addColorStop(0,'rgba(255,255,255,0)'); sh.addColorStop(.25,'rgba(255,255,255,0)'); sh.addColorStop(.42,'rgba(255,255,255,.55)'); sh.addColorStop(.5,'rgba(255,255,255,.4)'); sh.addColorStop(.7,'rgba(255,255,255,0)'); sh.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=sh; g.fillRect(0,0,S,S); g.restore();
  g.save(); g.globalCompositeOperation='screen';
  const sh2=g.createLinearGradient(S*.1,0,S*.9,S); sh2.addColorStop(.3,'rgba(255,255,255,0)'); sh2.addColorStop(.4,'rgba(255,255,255,.1)'); sh2.addColorStop(.46,'rgba(255,255,255,.04)'); sh2.addColorStop(.52,'rgba(255,255,255,.07)'); sh2.addColorStop(.6,'rgba(255,255,255,0)');
  g.fillStyle=sh2; g.fillRect(0,0,S,S); g.restore();
  // ごく弱い粒子（フィルムグレイン）
  const gs=256, gc=document.createElement('canvas'); gc.width=gc.height=gs; const gg=gc.getContext('2d'); const id=gg.createImageData(gs,gs);
  for (let i=0;i<gs*gs;i++){ const v=rnd()*255|0; id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=v; id.data[i*4+3]=255; } gg.putImageData(id,0,0);
  g.save(); g.globalCompositeOperation='overlay'; g.globalAlpha=.06; g.fillStyle=g.createPattern(gc,'repeat'); g.fillRect(0,0,S,S); g.restore();
  return c;
}
// ---- more.js ----
function _grid(img,N){ const c=document.createElement('canvas'); c.width=c.height=N; const g=c.getContext('2d',{willReadFrequently:true}); g.imageSmoothingQuality='high'; g.drawImage(img,0,0,N,N); return c; }
function _rnd(seed){ let r=seed>>>0; return ()=>((r=(r*1664525+1013904223)>>>0)/4294967296); }
function _lift(c,s=1.4,w=.15){ const m=(c[0]+c[1]+c[2])/3; return c.map(v=>Math.round(Math.max(0,Math.min(255,m+(v-m)*s))*(1-w)+255*w)); }
// ドット絵：大きな四角いマス＋マスごとの光沢と小さな星
function pdDot(img,S=1080,seed=7){ const rnd=_rnd(seed), N=24, sm=_grid(img,N), d=sm.getContext('2d').getImageData(0,0,N,N).data, c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d'), k=S/N;
  for (let y=0;y<N;y++) for (let x=0;x<N;x++){ const i=(y*N+x)*4, col=_lift([d[i],d[i+1],d[i+2]],1.5,.22); g.fillStyle=`rgb(${col})`; g.fillRect(x*k,y*k,k,k);
    g.fillStyle='rgba(255,255,255,.22)'; g.fillRect(x*k,y*k,k,k*.18); g.fillRect(x*k,y*k,k*.18,k); g.fillStyle='rgba(0,0,0,.10)'; g.fillRect(x*k,y*k+k*.82,k,k*.18); g.fillRect(x*k+k*.82,y*k,k*.18,k); }
  for (let t=0;t<40;t++){ const x=(rnd()*N|0)*k, y=(rnd()*N|0)*k, p=k/5; g.fillStyle='rgba(255,255,255,.9)'; g.fillRect(x+2*p,y+p,p,3*p); g.fillRect(x+p,y+2*p,3*p,p); }
  return c; }
// オーロラ：ぼかした色の上に、ゆらめく光のカーテン
function pdAurora(img,S=1080,seed=7){ const rnd=_rnd(seed), sm=_grid(img,12), c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d');
  g.filter=`blur(${S/9}px) saturate(1.6) brightness(1.2)`; g.drawImage(sm,-S*.1,-S*.1,S*1.2,S*1.2); g.filter='none'; g.fillStyle='rgba(255,255,255,.18)'; g.fillRect(0,0,S,S);
  const d=sm.getContext('2d').getImageData(0,0,12,12).data; g.globalCompositeOperation='screen';
  for (let b=0;b<7;b++){ const i=((rnd()*144)|0)*4, col=_lift([d[i],d[i+1],d[i+2]],1.8,.1), y0=S*(.1+rnd()*.8), amp=S*(.05+rnd()*.12), ph=rnd()*6, fr=1+rnd()*2;
    for (let x=0;x<S;x+=3){ const y=y0+Math.sin(x/S*6.28*fr+ph)*amp, h=S*(.12+.08*Math.sin(x/S*9+ph)); const gr=g.createLinearGradient(0,y-h,0,y+h*.2); gr.addColorStop(0,`rgba(${col},0)`); gr.addColorStop(.7,`rgba(${col},.32)`); gr.addColorStop(1,`rgba(${col},0)`); g.fillStyle=gr; g.fillRect(x,y-h,3,h*1.2); } }
  g.globalCompositeOperation='lighter'; for (let t=0;t<900;t++){ g.fillStyle=`rgba(255,255,255,${rnd()*.5})`; g.fillRect(rnd()*S,rnd()*S,1.3,1.3); } return c; }
// マーブル：色が流れるように混ざった大理石もよう
function pdMarble(img,S=1080,seed=7){ const rnd=_rnd(seed), N=16, sm=_grid(img,N), d=sm.getContext('2d').getImageData(0,0,N,N).data, R=270, c0=document.createElement('canvas'); c0.width=c0.height=R; const g0=c0.getContext('2d'), id=g0.createImageData(R,R);
  const sx=[],sy=[]; for (let k=0;k<4;k++){ sx.push(rnd()*6+2); sy.push(rnd()*6.28); }
  for (let y=0;y<R;y++) for (let x=0;x<R;x++){ let u=x/R, v=y/R; for (let k=0;k<4;k++){ const t=u; u+=.06*Math.sin(v*sx[k]*3.14+sy[k]); v+=.06*Math.sin(t*sx[k]*3.14+sy[k]); }
    u=Math.min(.999,Math.max(0,u)); v=Math.min(.999,Math.max(0,v)); const i=((v*N|0)*N+(u*N|0))*4, col=_lift([d[i],d[i+1],d[i+2]],1.5,.18), o=(y*R+x)*4; id.data[o]=col[0]; id.data[o+1]=col[1]; id.data[o+2]=col[2]; id.data[o+3]=255; }
  g0.putImageData(id,0,0); const c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d'); g.filter='blur(16px)'; g.drawImage(c0,-S*.05,-S*.05,S*1.1,S*1.1); g.filter='none';
  g.globalCompositeOperation='screen'; for (let t=0;t<9;t++){ g.beginPath(); let x=-50,y=rnd()*S; g.moveTo(x,y); g.bezierCurveTo(S*.3,y+(rnd()-.5)*S*.6,S*.7,y+(rnd()-.5)*S*.6,S+50,y+(rnd()-.5)*S*.4); g.lineWidth=1.5+rnd()*3; g.strokeStyle='rgba(255,255,255,.45)'; g.filter='blur(1px)'; g.stroke(); g.filter='none'; }
  g.globalCompositeOperation='lighter'; for (let t=0;t<600;t++){ g.fillStyle=`rgba(255,255,255,${rnd()*.5})`; g.fillRect(rnd()*S,rnd()*S,1.3,1.3); }
  g.globalCompositeOperation='source-over'; return c; }
// 放射線（集中線）：中心から広がる光の線＋ぼかした色
function pdRays(img,S=1080,seed=7){ const rnd=_rnd(seed), sm=_grid(img,12), c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d');
  g.filter=`blur(${S/10}px) saturate(1.3) brightness(1.08)`; g.drawImage(sm,-S*.1,-S*.1,S*1.2,S*1.2); g.filter='none';
  const cx=S/2, cy=S*.42; g.globalCompositeOperation='screen'; const n=48; for (let i=0;i<n;i++){ const a0=i/n*6.283+rnd()*.03, w=.04+rnd()*.05; g.beginPath(); g.moveTo(cx,cy); g.arc(cx,cy,S*1.2,a0,a0+w); g.closePath(); g.fillStyle=`rgba(255,255,255,${i%2?.08:.2})`; g.fill(); }
  const gr=g.createRadialGradient(cx,cy,0,cx,cy,S*.45); gr.addColorStop(0,'rgba(255,255,255,.7)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,S,S);
  g.globalCompositeOperation='lighter'; for (let t=0;t<500;t++){ g.fillStyle=`rgba(255,255,255,${rnd()*.6})`; g.fillRect(rnd()*S,rnd()*S,1.5,1.5); } return c; }
// ホログラム：ガチャの色の上に、角度で色が変わる虹色の帯（ホログラムシールのような光）
function pdHolo(img,S=1080,seed=7){ const rnd=_rnd(seed), sm=_grid(img,12), c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d');
  g.filter=`blur(${S/10}px) saturate(1.3) brightness(1.15)`; g.drawImage(sm,-S*.1,-S*.1,S*1.2,S*1.2); g.filter='none';
  g.globalCompositeOperation='hard-light'; g.globalAlpha=.42;
  for (let k=0;k<2;k++){ const a=rnd()*Math.PI, dx=Math.cos(a)*S, dy=Math.sin(a)*S; const gr=g.createLinearGradient(S/2-dx/2,S/2-dy/2,S/2+dx/2,S/2+dy/2);
    const cols=['#ff6fc4','#6fdcff','#fff06f','#9f7bff','#6fffb4']; for (let i=0;i<=12;i++) gr.addColorStop(i/12,cols[i%5]); g.fillStyle=gr; g.fillRect(0,0,S,S); }
  g.globalAlpha=1; g.globalCompositeOperation='soft-light'; for (let i=0;i<6;i++){ const y=rnd()*S*1.4; g.beginPath(); g.moveTo(0,y); g.lineTo(S,y-S*.5); g.lineTo(S,y-S*.5+S*.03); g.lineTo(0,y+S*.03); g.closePath(); g.fillStyle='rgba(255,255,255,.35)'; g.fill(); }
  g.globalCompositeOperation='lighter'; for (let t=0;t<1200;t++){ const h=rnd(); g.fillStyle=h<.5?`rgba(255,230,250,${rnd()*.5})`:`rgba(220,250,255,${rnd()*.5})`; g.fillRect(rnd()*S,rnd()*S,1.4,1.4); } return c; }
// 花びら：ふんわりした色の上に、ガチャの色の花びらが舞う
function pdPetal(img,S=1080,seed=7){ const rnd=_rnd(seed), N=12, sm=_grid(img,N), d=sm.getContext('2d').getImageData(0,0,N,N).data, c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d');
  g.filter=`blur(${S/10}px) saturate(1.2) brightness(1.18)`; g.drawImage(sm,-S*.1,-S*.1,S*1.2,S*1.2); g.filter='none'; g.fillStyle='rgba(255,255,255,.15)'; g.fillRect(0,0,S,S);
  for (let t=0;t<90;t++){ const x=rnd()*S, y=rnd()*S, i=((y/S*N|0)*N+(x/S*N|0))*4, col=_lift([d[i],d[i+1],d[i+2]],1.7,.35), s=S*(.012+rnd()*.022), a=rnd()*6.28;
    g.save(); g.translate(x,y); g.rotate(a); g.scale(1,.6+rnd()*.4); g.globalAlpha=.55+rnd()*.35; if (rnd()<.3) g.filter='blur(2px)';
    g.beginPath(); g.moveTo(0,-s); g.bezierCurveTo(s*.9,-s*.6,s*.7,s*.7,0,s); g.bezierCurveTo(-s*.7,s*.7,-s*.9,-s*.6,0,-s); g.moveTo(0,-s); g.closePath();
    const gr=g.createLinearGradient(0,-s,0,s); gr.addColorStop(0,`rgb(${col})`); gr.addColorStop(1,'rgba(255,255,255,.9)'); g.fillStyle=gr; g.fill(); g.restore(); }
  g.globalCompositeOperation='lighter'; for (let t=0;t<500;t++){ g.fillStyle=`rgba(255,255,255,${rnd()*.5})`; g.fillRect(rnd()*S,rnd()*S,1.3,1.3); } return c; }
// ---- holo.js ----
// ホログラムの6つの型。どれもガチャの色をぼかした下地＋虹色の光
const HC=['#ff6fc4','#6fdcff','#fff06f','#9f7bff','#6fffb4'];
function _hbase(img,S){ const sm=_grid(img,12), c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d'); g.filter=`blur(${S/10}px) saturate(1.3) brightness(1.15)`; g.drawImage(sm,-S*.1,-S*.1,S*1.2,S*1.2); g.filter='none'; return [c,g]; }
function _hlin(g,S,a,n,alpha,mode='hard-light'){ const dx=Math.cos(a)*S, dy=Math.sin(a)*S, gr=g.createLinearGradient(S/2-dx/2,S/2-dy/2,S/2+dx/2,S/2+dy/2); for (let i=0;i<=n;i++) gr.addColorStop(i/n,HC[i%5]); g.save(); g.globalCompositeOperation=mode; g.globalAlpha=alpha; g.fillStyle=gr; g.fillRect(0,0,S,S); g.restore(); }
function _glit(g,S,rnd,n=1500,stars=24){ g.save(); g.globalCompositeOperation='lighter'; for (let t=0;t<n;t++){ const h=rnd(); g.fillStyle=h<.33?`rgba(255,220,245,${rnd()*.6})`:h<.66?`rgba(210,245,255,${rnd()*.6})`:`rgba(255,250,215,${rnd()*.6})`; g.fillRect(rnd()*S,rnd()*S,1.5,1.5); }
  for (let k=0;k<stars;k++){ const x=rnd()*S, y=rnd()*S, l=S*(.008+rnd()*.016); for (const [dx,dy,L] of [[1,0,l],[0,1,l],[.7,.7,l*.45],[.7,-.7,l*.45]]){ const lg=g.createLinearGradient(x-dx*L,y-dy*L,x+dx*L,y+dy*L); lg.addColorStop(0,'rgba(255,255,255,0)'); lg.addColorStop(.5,'rgba(255,255,255,.9)'); lg.addColorStop(1,'rgba(255,255,255,0)'); g.strokeStyle=lg; g.lineWidth=1.2; g.beginPath(); g.moveTo(x-dx*L,y-dy*L); g.lineTo(x+dx*L,y+dy*L); g.stroke(); } } g.restore(); }
// 1 ホログラム＋ラメ：斜めの虹色にラメとキラッ
function pdHolo1(img,S=1080,seed=7){ const rnd=_rnd(seed), [c,g]=_hbase(img,S); _hlin(g,S,rnd()*3.14,12,.42); _hlin(g,S,rnd()*3.14,12,.3); _glit(g,S,rnd,2600,40); return c; }
// 2 放射ホログラム：中心から回る虹色（CDの裏のような）
function pdHolo2(img,S=1080,seed=7){ const rnd=_rnd(seed), [c,g]=_hbase(img,S); const cg=g.createConicGradient(rnd()*6,S*.5,S*.45); for (let i=0;i<=15;i++) cg.addColorStop(i/15,HC[i%5]);
  g.save(); g.globalCompositeOperation='hard-light'; g.globalAlpha=.45; g.fillStyle=cg; g.fillRect(0,0,S,S); g.restore();
  g.save(); g.globalCompositeOperation='screen'; const rg=g.createRadialGradient(S*.5,S*.45,0,S*.5,S*.45,S*.7); for (let i=0;i<=10;i++) rg.addColorStop(i/10,i%2?'rgba(255,255,255,0)':'rgba(255,255,255,.18)'); g.fillStyle=rg; g.fillRect(0,0,S,S); g.restore(); _glit(g,S,rnd,900,10); return c; }
// 3 波ホログラム：ゆらゆらした虹色の波
function pdHolo3(img,S=1080,seed=7){ const rnd=_rnd(seed), [c,g]=_hbase(img,S); const R=180, t=document.createElement('canvas'); t.width=t.height=R; const tg=t.getContext('2d'), id=tg.createImageData(R,R), P=HC.map(h=>[1,3,5].map(i=>parseInt(h.substr(i,2),16))), f1=2+rnd()*2, f2=3+rnd()*2, ph=rnd()*6;
  for (let y=0;y<R;y++) for (let x=0;x<R;x++){ const v=(x/R*f1+Math.sin(y/R*6.28*f2*.5+ph)*.6+Math.sin((x+y)/R*9)*.15)*5, k=Math.floor(v), fr=v-k, a=P[((k%5)+5)%5], b=P[(((k+1)%5)+5)%5], o=(y*R+x)*4; for (let j=0;j<3;j++) id.data[o+j]=a[j]+(b[j]-a[j])*fr; id.data[o+3]=255; }
  tg.putImageData(id,0,0); g.save(); g.globalCompositeOperation='hard-light'; g.globalAlpha=.5; g.filter='blur(4px)'; g.drawImage(t,0,0,S,S); g.restore(); _glit(g,S,rnd,900,12); return c; }
// 4 ダイヤカット：三角の小さな面がそれぞれちがう虹色に光る（ホログラム包装紙のような）
function pdHolo4(img,S=1080,seed=7){ const rnd=_rnd(seed), [c,g]=_hbase(img,S); const n=14, k=S/n; g.save(); g.globalCompositeOperation='hard-light';
  for (let y=0;y<n;y++) for (let x=0;x<n;x++) for (let tr=0;tr<2;tr++){ g.beginPath(); const X=x*k, Y=y*k; if (tr){ g.moveTo(X,Y); g.lineTo(X+k,Y); g.lineTo(X,Y+k); } else { g.moveTo(X+k,Y); g.lineTo(X+k,Y+k); g.lineTo(X,Y+k); } g.closePath();
    const gr=g.createLinearGradient(X,Y,X+k,Y+k), i=(x+y*2+tr*3+(rnd()*2|0))%5; gr.addColorStop(0,HC[i]); gr.addColorStop(1,HC[(i+1)%5]); g.globalAlpha=.28+rnd()*.25; g.fillStyle=gr; g.fill(); g.globalAlpha=.25; g.strokeStyle='#fff'; g.lineWidth=1; g.stroke(); }
  g.restore(); _hlin(g,S,.8,8,.2,'soft-light'); _glit(g,S,rnd,800,18); return c; }
// 5 星柄ホログラム：虹色に光る小さな星がいっぱい
function pdHolo5(img,S=1080,seed=7){ const rnd=_rnd(seed), [c,g]=_hbase(img,S); _hlin(g,S,rnd()*3.14,10,.3); const star=(x,y,r,rot)=>{ g.beginPath(); for (let i=0;i<10;i++){ const a=rot+i*Math.PI/5, rr=i%2?r*.45:r; g.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr); } g.closePath(); };
  g.save(); for (let t=0;t<120;t++){ const x=rnd()*S, y=rnd()*S, r=S*(.008+rnd()*.022); star(x,y,r,rnd()*6); const gr=g.createLinearGradient(x-r,y-r,x+r,y+r), i=rnd()*5|0; gr.addColorStop(0,HC[i]); gr.addColorStop(.5,'#ffffff'); gr.addColorStop(1,HC[(i+2)%5]); g.globalAlpha=.55+rnd()*.35; g.fillStyle=gr; g.fill(); } g.restore(); _glit(g,S,rnd,900,8); return c; }
// 6 玉虫色（オイルのような）：濃いめでメタリックな虹色が流れる
function pdHolo6(img,S=1080,seed=7){ const rnd=_rnd(seed), [c,g]=_hbase(img,S); const R=200, t=document.createElement('canvas'); t.width=t.height=R; const tg=t.getContext('2d'), id=tg.createImageData(R,R); const cx=[],cy=[]; for (let k=0;k<5;k++){ cx.push(rnd()); cy.push(rnd()); }
  for (let y=0;y<R;y++) for (let x=0;x<R;x++){ let v=0; for (let k=0;k<5;k++) v+=Math.sin(Math.hypot(x/R-cx[k],y/R-cy[k])*14+k); const h=(v*40+360)%360, o=(y*R+x)*4, cc=`hsl(${h},90%,62%)`; const m=cc.match(/\d+/g); 
    const hh=h/60, X=1-Math.abs(hh%2-1), C=.9*(1-Math.abs(2*.62-1)), mm=.62-C/2; let [r1,g1,b1]=hh<1?[C,C*X,0]:hh<2?[C*X,C,0]:hh<3?[0,C,C*X]:hh<4?[0,C*X,C]:hh<5?[C*X,0,C]:[C,0,C*X]; id.data[o]=(r1+mm)*255; id.data[o+1]=(g1+mm)*255; id.data[o+2]=(b1+mm)*255; id.data[o+3]=255; }
  tg.putImageData(id,0,0); g.save(); g.globalCompositeOperation='soft-light'; g.globalAlpha=.85; g.filter='blur(6px)'; g.drawImage(t,0,0,S,S); g.restore();
  g.save(); g.globalCompositeOperation='screen'; for (let i=0;i<5;i++){ g.beginPath(); const y=rnd()*S; g.moveTo(-40,y); g.bezierCurveTo(S*.3,y-S*.3,S*.7,y+S*.3,S+40,y); g.lineWidth=S*.02; g.strokeStyle='rgba(255,255,255,.18)'; g.filter='blur(8px)'; g.stroke(); } g.restore(); _glit(g,S,rnd,700,10); return c; }
// ---- まとめ ----
const FN={pearl:pdWcPearl,sparkle:pdSparkle,bokeh:pdBokeh,gradient:pdGradient,aurora:pdAurora,rays:pdRays,holo1:pdHolo1,holo5:pdHolo5};
window.GachaPat={ ver:'0b0aa8c1', native:NATIVE, list:[{"key":"pearl","name":"水彩画＋パールのキラキラ"},{"key":"sparkle","name":"キラキラ"},{"key":"bokeh","name":"ぼかし＋光の玉"},{"key":"gradient","name":"グラデーション"},{"key":"aurora","name":"オーロラ"},{"key":"rays","name":"放射線"},{"key":"holo1","name":"ホログラム＋ラメ"},{"key":"holo5","name":"星柄ホログラム"}],
  make(img,key,S=1080){ return (FN[key]||FN.pearl)(img,S,7); },
  // 丸い枠用の小さな見本。ラメの数は大きさで変わらないので、小さく作ると粒だらけになる→540で作って縮める
  thumb(img,key,S=128){ const b=this.make(img,key,540), c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d'); g.imageSmoothingQuality='high'; g.drawImage(b,0,0,S,S); return c; } };
})();
