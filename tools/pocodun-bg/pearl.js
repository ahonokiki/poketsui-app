// パール絵の具ふうの背景：ガチャの色で、へらで伸ばした厚塗りの絵の具（白っぽいパール→色へのグラデーション・へらの細い筋・端の放射）＋虹色の光沢＋ラメ
function pdPearl(img, S=1080, seed=11){
  let r=seed>>>0; const rnd=()=>((r=(r*1664525+1013904223)>>>0)/4294967296);
  const N=12, sm=document.createElement('canvas'); sm.width=sm.height=N; const sg=sm.getContext('2d',{willReadFrequently:true});
  sg.imageSmoothingQuality='high'; sg.drawImage(img,0,0,N,N); const px=sg.getImageData(0,0,N,N).data;
  const pal=[]; for (let i=0;i<px.length;i+=4){ const R=px[i],G=px[i+1],B=px[i+2], m=(R+G+B)/3, s=1.9; pal.push([R,G,B].map(v=>Math.round(Math.max(0,Math.min(255,m+(v-m)*s))))); }
  const col=(x,y)=>pal[Math.min(N-1,Math.max(0,(y/S*N)|0))*N+Math.min(N-1,Math.max(0,(x/S*N)|0))];
  const mix=(c,w,t)=>c.map((v,i)=>Math.round(v+(w[i]-v)*t)), rgb=(c,a=1)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const c=document.createElement('canvas'); c.width=c.height=S; const g=c.getContext('2d');
  // 下地：ガチャの色を大きくぼかす（少し暗めにして、絵の具が浮き出るように）
  g.fillStyle='#3a3048'; g.fillRect(0,0,S,S);
  g.save(); g.filter=`blur(${S/12}px) brightness(.8) saturate(1.3)`; g.drawImage(sm,-S*.1,-S*.1,S*1.2,S*1.2); g.restore();
  // 絵の具の塗り跡（豆の形）。左＝パールの白、右＝色。右の端に、へらを離したときの放射
  const blob=(x,y,len,wid,ang,base)=>{
    g.save(); g.translate(x,y); g.rotate(ang);
    const w1=wid*(.8+rnd()*.25), w2=wid, L=len/2;
    const path=()=>{ g.beginPath(); g.moveTo(-L,0); g.bezierCurveTo(-L,-w1*1.15,-L*.2,-w1*.85+(rnd()-.5)*wid*.1,0,-w1*.75); g.bezierCurveTo(L*.4,-w2*.75,L,-w2*1.2,L,0);
      g.bezierCurveTo(L,w2*1.2,L*.4,w2*.8,0,w1*.8); g.bezierCurveTo(-L*.2,w1*.9,-L,w1*1.15,-L,0); g.closePath(); };
    path(); g.shadowColor='rgba(0,0,0,.45)'; g.shadowBlur=wid*.25; g.shadowOffsetY=wid*.1;
    const gr=g.createLinearGradient(-L,0,L,0); gr.addColorStop(0,rgb(mix(base,[255,255,255],.8))); gr.addColorStop(.35,rgb(mix(base,[255,255,255],.35))); gr.addColorStop(.7,rgb(base)); gr.addColorStop(1,rgb(mix(base,[0,0,0],.2)));
    g.fillStyle=gr; g.fill(); g.shadowColor='transparent';
    g.save(); path(); g.clip();
    // へらの細い筋（指紋のような同心の弧）
    const cx=L*.55; for (let k=0;k<60;k++){ const rr=wid*.12+k*wid*.034; g.beginPath(); g.ellipse(cx-rr*.6,0,rr,rr*1.15,0,-1.35,1.35); g.lineWidth=1.3; g.strokeStyle=k%2?rgb(mix(base,[0,0,0],.4),.5):rgb([255,255,255],.5); g.stroke(); }
    // 端の放射
    for (let k=0;k<70;k++){ const a=rnd()*6.283, l=wid*(.08+rnd()*.32); g.beginPath(); g.moveTo(cx,0); g.lineTo(cx+Math.cos(a)*l,Math.sin(a)*l); g.lineWidth=.7; g.strokeStyle='rgba(255,255,255,.7)'; g.stroke(); }
    // ツヤ（上からの光）と、パールの白いすじ
    const hl=g.createLinearGradient(0,-wid,0,wid); hl.addColorStop(0,'rgba(255,255,255,.6)'); hl.addColorStop(.3,'rgba(255,255,255,.05)'); hl.addColorStop(.75,'rgba(0,0,0,0)'); hl.addColorStop(1,'rgba(0,0,0,.18)'); g.fillStyle=hl; g.fillRect(-L,-wid*1.3,len,wid*2.6);
    for (let k=0;k<5;k++){ g.beginPath(); const yy=(rnd()-.5)*wid; g.moveTo(-L*.9,yy); g.quadraticCurveTo(-L*.4,yy+(rnd()-.5)*wid*.5,-L*.05,yy*.6); g.lineWidth=wid*(.04+rnd()*.06); g.lineCap='round'; g.strokeStyle='rgba(255,255,255,.12)'; g.stroke(); }
    g.restore(); g.restore(); };
  const n=20; for (let t=0;t<n;t++){ const x=S*((t%4)+.5+(rnd()-.5)*1.1)/4, y=S*(((t/4)|0)+.5+(rnd()-.5)*1.0)/5; blob(x,y,S*(.22+rnd()*.24),S*(.06+rnd()*.045),(rnd()-.5)*1.8+(rnd()<.5?0:Math.PI),col(x,y)); }
  // パールの虹色の光沢
  g.save(); g.globalCompositeOperation='soft-light'; const ir=g.createLinearGradient(0,0,S,S); ['#ffc6ee','#bff0ff','#fff0a8','#dccbff','#bfffe0','#ffc6ee'].forEach((cc,i)=>ir.addColorStop(i/5,cc)); g.globalAlpha=.6; g.fillStyle=ir; g.fillRect(0,0,S,S); g.restore();
  // ラメ
  g.save(); g.globalCompositeOperation='lighter';
  for (let k=0;k<2600;k++){ const x=rnd()*S, y=rnd()*S, s=rnd()*1.4+.3; g.fillStyle=`rgba(255,${230+rnd()*25|0},${210+rnd()*45|0},${.2+rnd()*.55})`; g.fillRect(x,y,s,s); }
  for (let k=0;k<12;k++){ const x=rnd()*S, y=rnd()*S, l=S*(.006+rnd()*.012); const gr=g.createRadialGradient(x,y,0,x,y,l*2); gr.addColorStop(0,'rgba(255,255,255,.9)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.beginPath(); g.arc(x,y,l*2,0,7); g.fill();
    g.strokeStyle='rgba(255,255,255,.75)'; g.lineWidth=1; g.beginPath(); g.moveTo(x-l*3,y); g.lineTo(x+l*3,y); g.moveTo(x,y-l*3); g.lineTo(x,y+l*3); g.stroke(); }
  g.restore();
  return c;
}
