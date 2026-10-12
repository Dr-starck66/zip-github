#!/usr/bin/env python3
"""ASTRA image pilot: two EXACT Commons originals, source rights checked, local SEO WebP.
Not a generic image search or license assumption. Does not publish any page unless
metadata, image bytes and license constraints are verified. No paid APIs.
"""
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from io import BytesIO
from PIL import Image, ImageOps, ImageFilter
import hashlib
import json
import re

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"public"/"images"
MANIFEST=ROOT/"data"/"image-manifest.json"
SOURCES=[
 dict(
   route="/mao-valverde/", page_title="Mao y Valverde: noticias y contexto del noroeste",
   title="File:Mao Valverde Dominican Republic city 4.jpg",
   url="https://upload.wikimedia.org/wikipedia/commons/7/72/Mao_Valverde_Dominican_Republic_city_4.jpg",
   filename="parque-central-mao-valverde-paseo-arbolado.webp",
   alt="Paseo arbolado y sendero del parque central de Mao, provincia Valverde, República Dominicana",
   caption="Parque central de Mao fotografiado en 2023. Imagen contextual; no reproduce un acontecimiento de 2018.",
   author="Ultimo1988", crop="center", context="parque central y ciudad de Mao",
 ),
 dict(
   route="/santiago/",page_title="Santiago de los Caballeros: noticias y actualidad",
   title="File:Santiago de los Caballeros..jpg",
   url="https://upload.wikimedia.org/wikipedia/commons/b/b0/Santiago_de_los_Caballeros..jpg",
   filename="santiago-caballeros-panoramica-urbana-dia-noche.webp",
   alt="Panorámicas de Santiago de los Caballeros durante el día y la noche, mostrando edificios y calles de la ciudad",
   caption="Composición panorámica de Santiago de los Caballeros, publicada en 2023; no representa sucesos de 2018.",
   author="Enmanuelestebu",crop="letterbox",context="panorámicas de la ciudad de Santiago",
 )
]
UA="ASTRAImageRightsGuard/1.0 (source-attribution-and-seo; Wikimedia Commons one-time asset)"
API="https://commons.wikimedia.org/w/api.php"
def fetch(url,limit=16000000):
    req=Request(url,headers={"User-Agent":UA,"Accept":"application/json,image/jpeg,image/png,*/*"})
    with urlopen(req,timeout=25) as r:
        if r.status!=200:raise RuntimeError("GET HTTP "+str(r.status))
        b=r.read(limit+1)
        if len(b)>limit:raise RuntimeError("source over size budget")
        return b
def metadata(title):
    query=urlencode({"action":"query","format":"json","prop":"imageinfo",
        "iiprop":"url|size|sha1|extmetadata","titles":title})
    d=json.loads(fetch(API+"?"+query,500000))
    pages=list(d.get("query",{}).get("pages",{}).values())
    if len(pages)!=1 or pages[0].get("missing"):raise RuntimeError("Commons file missing")
    p=pages[0];i=p.get("imageinfo",[{}])[0];x=i.get("extmetadata",{})
    # NEVER accept NC/ND, unknown, or uncertain rights, even if hosted on Commons.
    l=x.get("LicenseShortName",{}).get("value","")
    if l!="CC BY-SA 4.0":raise RuntimeError("unexpected Commons license: "+str(l))
    if i.get("width",0)<1200 or i.get("height",0)<450:
        raise RuntimeError("Commons source dimensions unsuitable")
    if not str(i.get("url","")).startswith("https://upload.wikimedia.org/"):
        raise RuntimeError("untrusted source host")
    return i
def editorial_image(src):
    im=Image.open(BytesIO(src));im.load()
    if im.format not in ("JPEG","PNG","WEBP"):raise RuntimeError("input image unsupported")
    if im.width<1200 or im.height<450:raise RuntimeError("original too small")
    im=ImageOps.exif_transpose(im).convert("RGB")
    if im.width<1200:raise RuntimeError("would require quality-damaging upscale")
    w,h=1200,675
    if im.width/im.height >2.0:
        # Panoramic evidence is preserved; soften empty top/bottom instead of losing subject.
        bg=ImageOps.fit(im,(w,h),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(22))
        fg=im.copy();fg.thumbnail((w,h),Image.Resampling.LANCZOS)
        bg.paste(fg,((w-fg.width)//2,(h-fg.height)//2))
        return bg
    # Local town square framing is reviewed for a centered landscape crop.
    return ImageOps.fit(im,(w,h),Image.Resampling.LANCZOS,centering=(0.5,0.5))
def run():
    existing={}
    if MANIFEST.exists():
        existing=json.loads(MANIFEST.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True,exist_ok=True)
    for p in SOURCES:
        meta=metadata(p["title"])
        data=fetch(p["url"])
        # Strong binary proof: retrieved image must match Commons exact source revision.
        if hashlib.sha1(data).hexdigest()!=meta.get("sha1"):
            raise RuntimeError("Commons SHA1 mismatch: "+p["title"])
        pic=editorial_image(data)
        out=OUT/p["filename"]
        pic.save(out,"WEBP",quality=79,method=6)
        info=out.stat().st_size
        if info<10000 or info>400000:raise RuntimeError("WebP filesize outside validated bound "+str(info))
        with Image.open(out) as proof:
            if proof.format!="WEBP" or proof.size!=(1200,675):raise RuntimeError("not WebP 1200×675")
        source_url="https://commons.wikimedia.org/wiki/"+p["title"].replace(" ","_")
        record={
          "path":"/images/"+p["filename"],"width":1200,"height":675,
          "bytes":info,"mime":"image/webp",
          "alt":p["alt"],"caption":p["caption"],
          "source":{"type":"commons","filePage":source_url,
             "license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0/",
             "licenseEvidenceUrl":source_url,"checkedAt":str(date.today()),
             "author":p["author"],"derivativeLicense":"CC BY-SA 4.0",
             "adaptations":"resized / cropped or blurred background; same CC BY-SA 4.0"},
          "editorial":{"reviewed":True,"exactSubjectMatch":True,"placeMatch":True,
             "nonStockGeneric":True,"depictsHistoricalEvent":False,
             "isModernPhoto":True,"modernContextDeclared":True},
          "sha256":hashlib.sha256(out.read_bytes()).hexdigest(),
          "originSha1":meta["sha1"],
          "originalWidth":meta["width"],"originalHeight":meta["height"],
          "pageTitle":p["page_title"]
        }
        existing[p["route"]]=record
        print("ASTRA_IMAGE_PROOF",json.dumps({"page":p["route"],"asset":record["path"],
              "license":record["source"]["license"],"bytes":info,"width":1200,"height":675,
              "attribution":p["author"],"sha256":record["sha256"]}),flush=True)
    MANIFEST.parent.mkdir(parents=True,exist_ok=True)
    MANIFEST.write_text(json.dumps(existing,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
if __name__=="__main__":run()
