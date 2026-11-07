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
