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
