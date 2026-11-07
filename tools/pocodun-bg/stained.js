// ステンドグラスふうの背景：ガチャの色の配置だけを使い、ゆらぎのあるボロノイ状のガラス片（中心の色・内側グラデーション）＋濃い鉛線＋後ろから光が差すような柔らかい光
function pdStained(img, S=1080, seed=7){
  let r=seed>>>0; const rnd=()=>((r=(r*1664525+1013904223)>>>0)/4294967296);
  const N=16, sm=document.createElement('canvas'); sm.width=sm.height=N; const sg=sm.getContext('2d',{willReadFrequently:true});
  sg.imageSmoothingQuality='high'; sg.drawImage(img,0,0,N,N); const px=sg.getImageData(0,0,N,N).data;
  const pal=[]; for (let i=0;i<px.length;i+=4){ const R=px[i],G=px[i+1],B=px[i+2], m=(R+G+B)/3, s=2.1; pal.push([R,G,B].map(v=>Math.max(0,Math.min(255,m+(v-m)*s)))); }
  const col=(x,y)=>pal[Math.min(N-1,Math.max(0,(y/S*N)|0))*N+Math.min(N-1,Math.max(0,(x/S*N)|0))];
  const mix=(c,w,t)=>c.map((v,i)=>Math.round(v+(w[i]-v)*t)), rgb=(c,a=1)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
  const W=[255,255,255], K=[0,0,0];
  const bright=c0=>{ const mn=(c0[0]+c0[1]+c0[2])/3, ch=Math.max(...c0)-Math.min(...c0), k=ch<1?1:Math.min(2.5,Math.max(1,55/ch)); const c=c0.map(v=>Math.max(0,Math.min(255,mn+(v-mn)*k))); const l=(c[0]*.3+c[1]*.59+c[2]*.11); return mix(c,W,l<70?.42:l<110?.3:l<160?.12:.02); };
  // ゆらぎのある格子状の点（約90個）
  const cols=9, rows=10, pts=[];
  for (let j=-1;j<=rows;j++) for (let i=-1;i<=cols;i++){ const x=(i+.5+(rnd()-.5)*.85+(j%2?.25:-.25))*S/cols, y=(j+.5+(rnd()-.5)*.8)*S/rows; pts.push([x,y]); }
  // 半平面で切り取ってボロノイ多角形を作る
  const clip=(poly,ax,ay,bx,by)=>{ const mx=(ax+bx)/2,my=(ay+by)/2,nx=bx-ax,ny=by-ay, f=p=>(p[0]-mx)*nx+(p[1]-my)*ny, out=[];
    for (let k=0;k<poly.length;k++){ const p=poly[k], q=poly[(k+1)%poly.length], fp=f(p), fq=f(q);
      if (fp<=0) out.push(p); if ((fp<0&&fq>0)||(fp>0&&fq<0)){ const t=fp/(fp-fq); out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]); } } return out; };
  const M=S*.15, cells=[];
  for (let a=0;a<pts.length;a++){ const [ax,ay]=pts[a]; let poly=[[-M,-M],[S+M,-M],[S+M,S+M],[-M,S+M]];
    for (let b=0;b<pts.length;b++){ if (a===b) continue; const [bx,by]=pts[b]; if (Math.abs(bx-ax)>S*.4||Math.abs(by-ay)>S*.4) continue; poly=clip(poly,ax,ay,bx,by); if (poly.length<3) break; }
    if (poly.length<3) continue; let cx=0,cy=0; poly.forEach(p=>{cx+=p[0];cy+=p[1];}); cx/=poly.length; cy/=poly.length;
    let rad=0; poly.forEach(p=>{rad=Math.max(rad,Math.hypot(p[0]-cx,p[1]-cy));}); cells.push({poly,cx,cy,rad}); }
  const path=(g,poly)=>{ g.beginPath(); g.moveTo(poly[0][0],poly[0][1]); for (let k=1;k<poly.length;k++) g.lineTo(poly[k][0],poly[k][1]); g.closePath(); };
  const c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d');
  g.fillStyle='#3b2e28'; g.fillRect(0,0,S,S);
  // ガラス片
  for (const e of cells){ const v=(rnd()-.5)*.3, b0=bright(col(e.cx,e.cy)), base=v>0?mix(b0,W,v*.6):mix(b0,K,-v*.5); const lc=Math.max(0,Math.min(S,e.cx)), lc2=Math.max(0,Math.min(S,e.cy));
    g.save(); path(g,e.poly); g.clip();
    const ox=e.cx-e.rad*.25, oy=e.cy-e.rad*.3;
    const gr=g.createRadialGradient(ox,oy,0,e.cx,e.cy,e.rad*1.1);
    gr.addColorStop(0,rgb(mix(base,W,.5))); gr.addColorStop(.4,rgb(mix(base,W,.1))); gr.addColorStop(.85,rgb(base)); gr.addColorStop(1,rgb(mix(base,K,.18)));
    g.fillStyle=gr; g.fillRect(e.cx-e.rad*1.2,e.cy-e.rad*1.2,e.rad*2.4,e.rad*2.4);
    // ガラスのむら（手吹きガラスの泡・すじ）
    for (let k=0;k<5;k++){ const x=e.cx+(rnd()-.5)*e.rad*1.4, y=e.cy+(rnd()-.5)*e.rad*1.4, rr=e.rad*(.15+rnd()*.35);
      const sp=g.createRadialGradient(x,y,0,x,y,rr); const dk=rnd()<.5; sp.addColorStop(0,dk?rgb(mix(base,K,.25),.18):'rgba(255,255,255,.22)'); sp.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=sp; g.beginPath(); g.arc(x,y,rr,0,7); g.fill(); }
    const ang=rnd()*Math.PI, ca=Math.cos(ang), sa=Math.sin(ang); g.lineWidth=S*.0025;
    for (let k=-4;k<=4;k++){ const d=k*e.rad*.2; g.beginPath();
      for (let t=-1.3;t<=1.31;t+=.1){ const w=Math.sin(t*4+k*1.7)*e.rad*.05, x=e.cx+ca*t*e.rad-sa*(d+w), y=e.cy+sa*t*e.rad+ca*(d+w); t<-1.25?g.moveTo(x,y):g.lineTo(x,y); }
      g.strokeStyle=k%2?'rgba(255,255,255,.09)':rgb(mix(base,K,.3),.07); g.stroke(); }
    // 縁の内側の陰影（ガラスの厚み）
    path(g,e.poly); g.lineWidth=S*.014; g.strokeStyle=rgb(mix(base,K,.3),.35); g.stroke();
    path(g,e.poly); g.lineWidth=S*.006; g.strokeStyle='rgba(255,255,255,.18)'; g.translate(S*.002,S*.003); g.stroke();
    g.restore(); }
  // 後ろから差す光（スクリーン合成のやわらかい光）
  g.save(); g.globalCompositeOperation='screen';
  const gl=g.createRadialGradient(S*.38,S*.3,0,S*.45,S*.4,S*.85); gl.addColorStop(0,'rgba(255,250,235,.42)'); gl.addColorStop(.45,'rgba(255,245,230,.16)'); gl.addColorStop(1,'rgba(255,240,230,0)');
  g.fillStyle=gl; g.fillRect(0,0,S,S);
  for (let k=0;k<5;k++){ const x=rnd()*S, y=rnd()*S*.8, rr=S*(.12+rnd()*.15); const h=g.createRadialGradient(x,y,0,x,y,rr); h.addColorStop(0,'rgba(255,255,245,.18)'); h.addColorStop(1,'rgba(255,255,245,0)'); g.fillStyle=h; g.fillRect(x-rr,y-rr,rr*2,rr*2); }
  g.restore();
  // 鉛線（濃い茶灰色＋上側の鈍い光）
  g.lineJoin='round'; g.lineCap='round';
  for (const e of cells){ path(g,e.poly); g.lineWidth=S*.0055; g.strokeStyle='#2e2420'; g.stroke(); }
  g.save(); g.translate(-S*.0008,-S*.0012); for (const e of cells){ path(g,e.poly); g.lineWidth=S*.0014; g.strokeStyle='rgba(150,130,115,.55)'; g.stroke(); } g.restore();
  // 光の拡散（ふちが少しにじむ）
  g.save(); g.globalCompositeOperation='soft-light'; g.globalAlpha=.35; g.filter=`blur(${S*.012}px)`; g.drawImage(c,0,0); g.restore();
  // 四隅を少し落とす
  const vg=g.createRadialGradient(S/2,S/2,S*.45,S/2,S/2,S*.78); vg.addColorStop(0,'rgba(40,25,20,0)'); vg.addColorStop(1,'rgba(40,25,20,.28)'); g.fillStyle=vg; g.fillRect(0,0,S,S);
  return c;
}
