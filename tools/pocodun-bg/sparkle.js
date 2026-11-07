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
