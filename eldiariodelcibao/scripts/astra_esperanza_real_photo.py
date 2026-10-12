#!/usr/bin/env python3
"""Download VERIFIED Esperanza, Valverde 2014 documentary street photo.
Photo NOT of 2018 demonstrations or 2018 road works. CC BY-SA 4.0, Valvedero99.
Fail closed if no valid photo. No API keys or license fees.
"""
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from PIL import Image,ImageOps
from io import BytesIO
import json,hashlib,time,random

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"public/images/esperanza-valverde-calle-desfile-comunitario-2014.webp"
MANIFEST=ROOT/"data/image-manifest.json"
PAGE="/archivo/2018/esperanza-boca-de-mao-obras-protestas/"
FILE="https://commons.wikimedia.org/wiki/File:Esperanza_Dominican_Republic.jpg"
UPLOAD="https://upload.wikimedia.org/wikipedia/commons/0/0b/Esperanza_Dominican_Republic.jpg"
# Commons published digest for exact 1000x642 original (2026-10-12).
SHA1="c8aadb4ee23fc2556c9c9bf023af6d6f69ef72a2"
HOSTS=[
UPLOAD,
"https://commons.wikimedia.org/wiki/Special:Redirect/file/Esperanza_Dominican_Republic.jpg",
"https://i0.wp.com/upload.wikimedia.org/wikipedia/commons/0/0b/Esperanza_Dominican_Republic.jpg"
]
def fetch(url):
 req=Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; ASTRAImageRestoration/1.0; editorial research, https://eldiariodelcibao.com)","Accept":"image/jpeg,*/*"})
 with urlopen(req,timeout=23) as r:
  if r.status!=200 or not r.headers.get("Content-Type","").startswith("image/"):
   raise ValueError("not an original image")
  b=r.read(5000000)
  if not 100000<=len(b)<=4999999 or b[:2]!=b"\\xff\\xd8":raise ValueError("invalid JPEG")
  return b
def main():
 content=None
 errors=[]
 for url in HOSTS:
  try:
   b=fetch(url)
   with Image.open(BytesIO(b)) as im:
    im.load()
    if im.size!=(1000,642) or im.format!="JPEG":raise ValueError("wrong file")
   sourceSHA=hashlib.sha1(b).hexdigest()
   if url==UPLOAD and sourceSHA!=SHA1:raise ValueError("official Commons checksum mismatch")
   if sourceSHA!=SHA1 and "i0.wp.com" not in url:raise ValueError("original bytes differ")
   content=b
   print("ASTRA_ESPERANZA_SOURCE",json.dumps({"url":url,"bytes":len(b),"sha1":sourceSHA,"exactOriginal":sourceSHA==SHA1}),flush=True)
   break
  except Exception as err:
   errors.append({"host":url.split("/")[2],"error":type(err).__name__,"code":getattr(err,"code",None)})
 if not content:raise SystemExit("FAIL source unavailable: "+json.dumps(errors))
 with Image.open(BytesIO(content)) as raw:
  raw=ImageOps.exif_transpose(raw).convert("RGB")
  # Modest enlargement (1.2x) and subject-preserving central crop; no invented people or scenes.
  target=ImageOps.fit(raw,(1200,675),Image.Resampling.LANCZOS,centering=(0.5,0.52))
  OUT.parent.mkdir(parents=True,exist_ok=True)
  target.save(OUT,"WEBP",quality=83,method=6)
 encoded=OUT.read_bytes()
 with Image.open(OUT) as proof:
  if proof.format!="WEBP" or proof.size!=(1200,675):raise SystemExit("FAIL output dimensions")
 if not 20000<len(encoded)<400000:raise SystemExit("FAIL optimized file budget "+str(len(encoded)))
 manifest=json.loads(MANIFEST.read_text())
 manifest[PAGE]={
  "path":"/images/"+OUT.name,"width":1200,"height":675,"bytes":len(encoded),"mime":"image/webp",
  "alt":"Desfile cultural celebrado en una calle real de Esperanza, provincia Valverde, República Dominicana, en 2014",
  "caption":"Esperanza, Valverde: desfile cultural fotografiado el 12 de marzo de 2014. Imagen contextual de la localidad; NO muestra el paro ni las obras de 2018. Fotografía: Valvedero99 (CC BY-SA 4.0). Recorte y adaptación WebP.",
  "source":{"type":"commons","filePage":FILE,"licenseEvidenceUrl":FILE,
    "license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0/",
    "checkedAt":"2026-10-12","author":"Valvedero99","derivativeLicense":"CC BY-SA 4.0",
    "adaptations":"Ampliación 1000→1200 px, recorte panorámico et conversion WebP, 2026-10-12",
    "upstreamSHA1":SHA1},
  "editorial":{"reviewed":True,"exactSubjectMatch":True,"placeMatch":True,
    "nonStockGeneric":True,"depictsHistoricalEvent":False,
    "isModernPhoto":False,"modernContextDeclared":True},
  "sha256":hashlib.sha256(encoded).hexdigest(),
  "pageTitle":"Esperanza y Boca de Mao en junio de 2018: obras, protestas e identidad local",
  "editorialScope":"Location documentation only. The image is NOT an illustration of a 2018 event."
 }
 MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\\n",encoding="utf-8")
 print("ASTRA_ESPERANZA_WEBP_PASS",json.dumps({"filename":OUT.name,"bytes":len(encoded),"sha256":hashlib.sha256(encoded).hexdigest(),"captionHonest":True}))
if __name__=="__main__":main()
