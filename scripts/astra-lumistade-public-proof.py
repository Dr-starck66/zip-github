#!/usr/bin/env python3
"""ASTRA Ω public postflight: require exact live source and distinct topical JPEGs.
Read-only production checks. No changes to the app and no external API fees."""
import hashlib, json, re, time, urllib.request
BASE="https://betgpt.live"
TARGET="ef5d53a4799cc6c00cf085922ba80e83165cccd8"
PAIRS={
"/blog/lumistade":("lumistade-presentation","lumistade-presentation-detail"),
"/blog/lumistade-avis":("lumistade-avis","lumistade-avis-controle"),
"/blog/lumistade-prix-livraison":("lumistade-prix-livraison","lumistade-prix-comparatif"),
"/blog/lumistade-stades-psg-om":("lumistade-psg-om","lumistade-stades-architecture"),
"/blog/lumistade-stade-3d-cadeau-foot":("lumistade-cadeau","lumistade-cadeau-deco"),
}
def fetch(url, attempts=6, timeout=18):
    failures=[]
    for k in range(attempts):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"ASTRA-Lumistade-Public-Proof/1.0","Cache-Control":"no-cache"})
            with urllib.request.urlopen(req,timeout=timeout) as r:
                assert r.status==200,(r.status,url)
                return r.read(),r.headers
        except Exception as e:
            failures.append(str(e))
            if k<attempts-1:time.sleep(4)
    raise RuntimeError(f"HTTP_UNVERIFIED {url} last={failures[-1]}")
def dimensions(jpg):
    if jpg[:2]!=b"\xff\xd8":raise ValueError("not JPEG")
    i=2
    while i<len(jpg)-9:
        if jpg[i]!=255:i+=1;continue
        kind=jpg[i+1]
        if kind in (0xd8,0x01):i+=2;continue
        if kind in (0xda,0xd9):break
        size=int.from_bytes(jpg[i+2:i+4],"big")
        if size<2:raise ValueError("JPEG structure")
        if kind in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf):
            return int.from_bytes(jpg[i+7:i+9],"big"),int.from_bytes(jpg[i+5:i+7],"big")
        i+=size+2
    raise ValueError("dimensions unavailable")
for k in range(10):
    try:
        rev,_=fetch(BASE+"/astra-revision.json",attempts=1)
        got=json.loads(rev).get("sourceSha")
        print("ASTRA_PUBLIC_SHA",got)
        if got==TARGET:break
    except Exception as e:print("ASTRA_PUBLIC_SHA_RETRY",str(e))
    time.sleep(5)
else:raise RuntimeError("public sourceSha does not match GREEN release")
hashes=[]
for page,(hero,inline) in PAIRS.items():
    body,headers=fetch(BASE+page)
    html=body.decode("utf-8","replace")
    expected=BASE+"/blog/discover/lumistade/"+hero+".jpg"
    assert expected in html,(page,"cover not in HTML")
    assert 'max-image-preview:large' in html,(page,"no large preview meta")
    assert BASE+page in html,(page,"canonical missing")
    assert "1600" in html and "900" in html,(page,"OG dimensions wrong")
    print("ASTRA_LUMISTADE_HTML_PASS",page,"bytes",len(body))
    for variant in (hero,inline):
        url=BASE+"/blog/discover/lumistade/"+variant+".jpg"
        image,headers=fetch(url)
        assert "image/jpeg" in headers.get("Content-Type",""),(url,headers.get("Content-Type"))
        w,h=dimensions(image)
        assert w>=1200 and h>=675,(url,w,h)
        hashes.append(hashlib.sha256(image).hexdigest())
        print("ASTRA_LUMISTADE_IMAGE_HTTP_PASS",url,w,h,"bytes",len(image))
assert len(hashes)==10 and len(set(hashes))==10,"duplicate or missing JPEG"
sitemap,_=fetch(BASE+"/sitemap.xml",attempts=5,timeout=30)
xml=sitemap.decode("utf-8","replace")
for page in PAIRS:
    assert BASE+page in xml,"sitemap missing "+page
print("ASTRA_LUMISTADE_PUBLIC_PASS pages=5 images=10 unique=10 sitemap=5 sha="+TARGET)
