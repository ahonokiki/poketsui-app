"""ポコダン：名前の並び順（gw.json の o）を作る。小さいほど先。
1) 開催中の期間限定ガチャを「キャラの新しさ（図鑑Noの大きさ）」の順に並べ、各ガチャの中は GameWith の当たり順
   いちばん新しいガチャのシリーズ（そのガチャの図鑑No の最小以上）のほかのキャラもその直後
2) ほかは GameWith 最強ランキングの順、ランキングにないものは図鑑No の新しい順
使い方: python3 pocodun-order.py gacha_now.json rank.json merged.json gw.json"""
import json,sys
G,R,M=(json.load(open(f)) for f in sys.argv[1:4]); gwp=sys.argv[4]; GW=json.load(open(gwp))
art={no:v.get('article') for no,v in M.items()}; fam={}
for no,a in art.items():
    if a: fam.setdefault(a,[]).append(no)
famof=lambda no: fam.get(art.get(no),[no]) if art.get(no) else [no]
lim=sorted([g for g in G if not g.get('permanent') and g['monsters']], key=lambda g:-max(int(m['no']) for m in g['monsters']))
o={}; k=0
for gi,g in enumerate(lim):
    for m in sorted(g['monsters'],key=lambda m:m.get('rank_in_gacha',99)):
        for no in famof(m['no']):
            if no not in o: o[no]=k
        k+=1
    if gi==0:  # 同じシリーズ（新キャラ）のほかのもの
        lo=min(int(m['no']) for m in g['monsters'])
        for no in sorted((n for n in M if int(n)>=lo and n not in o), key=lambda n:(R.get(n,9999),-int(n))):
            for f in famof(no):
                if f not in o: o[f]=k
            k+=1
base=k+10
for x in GW:
    no=x['i']
    if no in o: x['o']=o[no]
    elif no in R: x['o']=base+R[no]
    elif x.get('n'): x['o']=base+1000+(4000-int(no))
json.dump(GW,open(gwp,'w'),ensure_ascii=False,separators=(',',':'))
print('ordered',sum(1 for x in GW if x.get('o') is not None),'first:',[ (x['i'],x['n']) for x in sorted([x for x in GW if x.get('o') is not None],key=lambda x:x['o'])[:12]])
