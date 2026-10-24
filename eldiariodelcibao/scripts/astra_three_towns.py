#!/usr/bin/env python3
"""ASTRA second photo batch: exact Mao and La Vega places, without generic replacements."""
import astra_batch_real_places as base
from pathlib import Path
from urllib.parse import urlencode,quote
from datetime import date
from io import BytesIO
from PIL import Image
import json,hashlib,re

SOURCES=[
 {"route":"/jarabacoa/","title":"Jarabacoa: turismo, montaña y actualidad local",
  "file":"File:JarabacoaRD.jpg","author":"Ronny Medina","license":"CC BY-SA 4.0",
  "name":"jarabacoa-la-vega-vista-real-ciudad-montana.webp",
  "alt":"Fotografía auténtica de Jarabacoa, municipio de montaña de la provincia La Vega en la República Dominicana",
  "caption":"Vista de Jarabacoa documentada por Ronny Medina. CC BY-SA 4.0; composición WebP panorámica.",
  "layout":"contain"},
 {"route":"/constanza/","title":"Constanza: agricultura, montaña, turismo y actualidad",
  "file":"File:Constanza Dominican Republic.jpg","author":"CristoRey99","license":"CC BY-SA 4.0",
  "name":"constanza-valle-ciudad-provincia-la-vega.webp",
  "alt":"Vista real de Constanza, localidad de montaña de la provincia La Vega en República Dominicana",
  "caption":"Vista documental de Constanza, provincia La Vega. Fotografía: CristoRey99; CC BY-SA 4.0. Adaptación panorámica WebP.",
  "layout":"fit"},
 {"route":"/monte-cristi/","title":"Monte Cristi: actualidad y contexto del noroeste",
  "file":"File:Montecristi Dominican Republic El Morro 4.jpg","author":"Ultimo1988","license":"CC BY-SA 4.0",
  "name":"monte-cristi-camino-desertico-el-morro-2023.webp",
  "alt":"Camino real por el paisaje árido de El Morro de Monte Cristi en el noroeste dominicano",
  "caption":"Paisaje del camino hacia El Morro, Monte Cristi, fotografiado en 2023 por Ultimo1988. CC BY-SA 4.0; recorte WebP.",
  "layout":"fit"}
]

def metadata():
 q=base.API+"?"+urlencode({"action":"query","format":"json","prop":"imageinfo",
  "iiprop":"url|size|sha1|extmetadata","iiurlwidth":"1280",
  "titles":"|".join(x["file"] for x in SOURCES)})
 j=json.loads(base.download(q,750000))
 pages={x["title"]:x.get("imageinfo",[{}])[0] for x in j.get("query",{}).get("pages",{}).values()}
 if len(pages)!=len(SOURCES):raise RuntimeError("incomplete MediaWiki evidence")
 return pages
def main():
 data=metadata()
 ledger=json.loads(base.REG.read_text(encoding="utf8"))
 passed=[];blocked=[]
 base.DEST.mkdir(parents=True,exist_ok=True)
 for entry in SOURCES:
  try:
   x=data[entry["file"]]
   lic=x.get("extmetadata",{}).get("LicenseShortName",{}).get("value")
   if lic!=entry["license"]:raise ValueError("Commons rights differ")
   if not re.fullmatch("[0-9a-f]{40}",str(x.get("sha1",""))):raise ValueError("source checksum missing")
   if x.get("width",0)<1280 or x.get("height",0)<600:raise ValueError("not landscape resolution")
   x["filename"]=entry["file"][5:]
   binary,url=base.select_source(x)
   if url==x["url"].split("?")[0] and hashlib.sha1(binary).hexdigest()!=x["sha1"]:
    raise ValueError("original source digest inconsistent")
   # Exact place photo, NOT an image of 2018 news event.
   im=base.raster(binary,"fit")
   file=base.DEST/entry["name"]
   im.save(file,"WEBP",quality=82,method=6)
   raw=file.read_bytes()
   if len(raw)<20000 or len(raw)>400000:raise ValueError("WebP size outside budget")
   with Image.open(file) as proof:
    if proof.size!=(1200,675) or proof.format!="WEBP":raise ValueError("invalid image")
   page="https://commons.wikimedia.org/wiki/"+quote(entry["file"].replace(" ","_"),safe=":_-.,")
   record={"path":"/images/"+entry["name"],"width":1200,"height":675,"bytes":len(raw),
    "mime":"image/webp","alt":entry["alt"],"caption":entry["caption"],
    "source":{"type":"commons","filePage":page,"licenseEvidenceUrl":page,
     "license":entry["license"],"licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0/",
     "checkedAt":str(date.today()),"author":entry["author"],
     "derivativeLicense":entry["license"],"originalSha1":x["sha1"],
     "downloadedSha1":hashlib.sha1(binary).hexdigest(),"sourceEndpoint":url,
     "adaptations":"subject-specific 1200x675 WebP crop"},
    "editorial":{"reviewed":True,"exactSubjectMatch":True,"placeMatch":True,
     "nonStockGeneric":True,"depictsHistoricalEvent":False,
     "isModernPhoto":True,"modernContextDeclared":True},
    "sha256":hashlib.sha256(raw).hexdigest(),"pageTitle":entry["title"]}
   ledger[entry["route"]]=record
   passed.append(entry["route"])
   print("ASTRA_PLACE_PHOTO_PROVEN",json.dumps({"route":entry["route"],"name":file.name,"bytes":len(raw),"license":lic,"source":page}),flush=True)
  except Exception as err:
   blocked.append({"route":entry["route"],"error":str(err)[:160]})
   print("ASTRA_PLACE_PHOTO_BLOCKED",json.dumps(blocked[-1]),flush=True)
 base.REG.write_text(json.dumps(ledger,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
 print("ASTRA_PLACE_PHOTO_RESULTS",json.dumps({"passed":passed,"blocked":blocked}),flush=True)
 if not passed:raise SystemExit("nothing publishable")
if __name__=="__main__":main()
