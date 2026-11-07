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
