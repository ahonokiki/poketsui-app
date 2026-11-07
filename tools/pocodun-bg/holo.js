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
