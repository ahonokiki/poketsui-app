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
