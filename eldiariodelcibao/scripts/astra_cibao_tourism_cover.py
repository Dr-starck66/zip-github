#!/usr/bin/env python3
"""ASTRA document photograph for the Cibao tourism guide.
Wikimedia Commons: Fanny S Forsdik, Puerto Plata panorama of 30 Dec 2013,
CC BY-SA 3.0; not an image of all sites named in the regional article.
"""
from pathlib import Path
from urllib.parse import urlencode,quote
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from io import BytesIO
from datetime import date
from PIL import Image,ImageOps,ImageFilter
import hashlib,json

ROOT=Path(__file__).resolve().parents[1]
FILE="File:Puerto Plata - panoramio.jpg"
PAGE="https://commons.wikimedia.org/wiki/File:Puerto_Plata_-_panoramio.jpg"
ROUTE="/turismo-en-el-cibao/"
OUT=ROOT/"public/images/turismo-cibao-puerto-plata-panoramica-atlantico.webp"
MAN=ROOT/"data/image-manifest.json"
UA="ASTRA-CibaoTourismRightsGuard/1.0 (reusing credited CC photography, eldiariodelcibao.com)"
def fetch(url,maxsize=15000000):
 req=Request(url,headers={"User-Agent":UA,"Accept":"image/jpeg,application/json,*/*"})
 with urlopen(req,timeout=25) as r:
  if r.status!=200:raise RuntimeError("HTTP "+str(r.status))
  b=r.read(maxsize+1)
  if len(b)>maxsize:raise RuntimeError("file exceeds max size")
  return b
def main():
 api="https://commons.wikimedia.org/w/api.php?"+urlencode({
  "action":"query","format":"json","prop":"imageinfo",
  "iiprop":"url|size|sha1|extmetadata","iiurlwidth":"1920","titles":FILE})
 j=json.loads(fetch(api,800000))
 ps=list(j.get("query",{}).get("pages",{}).values())
 if len(ps)!=1 or not ps[0].get("imageinfo"):raise RuntimeError("missing Wikimedia file")
 meta=ps[0]["imageinfo"][0]
 license=meta.get("extmetadata",{}).get("LicenseShortName",{}).get("value")
 if license!="CC BY-SA 3.0":raise RuntimeError("Wikimedia license changed/unknown: "+str(license))
 if meta.get("width",0)<2000 or meta.get("height",0)<1000:raise RuntimeError("Commons original low-res")
 original_sha1="a702bdadf9156888780cbd1d07f0a389d4ccf5f2"
 if meta.get("sha1")!=original_sha1:raise RuntimeError("source revision mismatch; rights must be reverified")
 if not str(meta.get("url","")).startswith("https://upload.wikimedia.org/"):raise RuntimeError("bad media source host")
 candidates=[meta.get("thumburl",""),meta.get("url","")]
 data=None;source_url=None;errors=[]
 for url in candidates:
  if not url:continue
  try:
   raw=fetch(url)
   with Image.open(BytesIO(raw)) as im:
    im.load()
    if im.format!="JPEG" or im.width<1200 or im.height<380:raise RuntimeError("wrong photograph format/dimensions")
   if url==meta["url"] and hashlib.sha1(raw).hexdigest()!=original_sha1:raise RuntimeError("original file checksum mismatch")
   data=raw;source_url=url
   break
  except Exception as e:
   errors.append(type(e).__name__+":"+str(e)[:120])
 if data is None:raise RuntimeError("source unavailable "+str(errors))
 with Image.open(BytesIO(data)) as im:
  im=ImageOps.exif_transpose(im).convert("RGB")
  # Preserve panoramic documentation in frame, without falsifying local features.
  back=ImageOps.fit(im,(1200,675),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(30))
  subject=im.copy();subject.thumbnail((1200,675),Image.Resampling.LANCZOS)
  back.paste(subject,((1200-subject.width)//2,(675-subject.height)//2))
  OUT.parent.mkdir(parents=True,exist_ok=True)
  back.save(OUT,"WEBP",quality=81,method=6)
 b=OUT.read_bytes()
 with Image.open(OUT) as chk:
  if chk.format!="WEBP" or chk.size!=(1200,675):raise RuntimeError("wrong WebP")
 if not 14000<len(b)<400000:raise RuntimeError("WebP asset not optimized")
 manifest=json.loads(MAN.read_text(encoding="utf8"))
 manifest[ROUTE]={
  "path":"/images/"+OUT.name,
  "width":1200,"height":675,"bytes":len(b),"mime":"image/webp",
  "alt":"Panorámica real de Puerto Plata en la costa atlántica de República Dominicana, incluida en la ruta turística del norte",
  "caption":"Puerto Plata, costa atlántica, fotografiada el 30 de diciembre de 2013 por Fanny S Forsdik (CC BY-SA 3.0). Recorte adaptado a WebP; vista contextual de uno de los destinos de esta guía.",
  "source":{"type":"commons","filePage":PAGE,"licenseEvidenceUrl":PAGE,
   "license":"CC BY-SA 3.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/3.0/",
   "checkedAt":str(date.today()),"author":"Fanny S Forsdik","derivativeLicense":"CC BY-SA 3.0",
   "originalSha1":original_sha1,"downloadedSha1":hashlib.sha1(data).hexdigest(),
   "adaptations":"preserved original panorama as foreground, blurred backdrop, WebP conversion"},
  "editorial":{"reviewed":True,"exactSubjectMatch":True,"placeMatch":True,
   "nonStockGeneric":True,"depictsHistoricalEvent":False,"isModernPhoto":False,"modernContextDeclared":True},
  "sha256":hashlib.sha256(b).hexdigest(),
  "pageTitle":"Turismo en el Cibao: Santiago, montañas, cascadas y costa norte"
 }
 MAN.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
 print("ASTRA_CIBAO_TOURISM_IMAGE_PROOF",json.dumps({"status":"PASS","url":source_url,"licensedCommons":PAGE,"file":OUT.name,"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()}),flush=True)
if __name__=="__main__":main()
