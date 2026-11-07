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
