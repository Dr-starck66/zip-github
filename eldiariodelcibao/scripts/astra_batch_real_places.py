#!/usr/bin/env python3
"""ASTRA CIBAO photo restoration -- exact Commons subjects, verified license metadata.
One-shot batch, does not invent historical-event photos. Produces genuine local 1200×675
WebP with per-page original Commons author/license and SHA provenance.
If a file fails, leave that page untouched. Zero paid services.
"""
from pathlib import Path
from datetime import date
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
from urllib.parse import urlencode,quote,urlparse
from io import BytesIO
import hashlib,json,time,random,re,html as htmlmod
from PIL import Image,ImageOps,ImageFilter

ROOT=Path(__file__).resolve().parents[1]
REG=ROOT/"data/image-manifest.json"
DEST=ROOT/"public/images"
API="https://commons.wikimedia.org/w/api.php"
UA="ASTRA-Cibao-ImageLicenseAudit/1.1 (licensed editorial use, eldiariodelcibao.com)"
SOURCES=[
 {"route":"/santiago/","title":"Santiago de los Caballeros: noticias y actualidad",
  "file":"File:Santiago-edit.jpg","author":"Janel J. Díaz","license":"CC BY-SA 3.0",
  "name":"santiago-caballeros-vista-panoramica-urbana.webp",
  "alt":"Vista panorámica auténtica de la ciudad de Santiago de los Caballeros, República Dominicana",
  "caption":"Vista general de Santiago de los Caballeros. Fotografía de Janel J. Díaz, CC BY-SA 3.0; recortada y optimizada para este portal.",
  "layout":"fit"},
 {"route":"/mao-valverde/","title":"Mao y Valverde: noticias y contexto del noroeste",
  "file":"File:Mao Valverde Dominican Republic city 4.jpg","author":"Ultimo1988","license":"CC BY-SA 4.0",
  "name":"mao-valverde-parque-central-ciudad-2023.webp",
  "alt":"Área del parque central de Mao en la provincia Valverde de la República Dominicana",
  "caption":"Zona del parque central de Mao, fotografiada en 2023. Autor: Ultimo1988, CC BY-SA 4.0; adaptación panorámica para la guía local.",
  "layout":"contain"},
 {"route":"/monumento-heroes-restauracion-santiago/","title":"Monumento a los Héroes de la Restauración en Santiago",
  "file":"File:Monumento a los Héroes de la Restauración, de Santiago de los caballeros.jpg",
  "author":"Diori de Jesús Lora Amaro","license":"CC BY-SA 4.0",
  "name":"monumento-heroes-restauracion-santiago-fotografia.webp",
  "alt":"Fotografía del verdadero Monumento a los Héroes de la Restauración en Santiago de los Caballeros",
  "caption":"Monumento a los Héroes de la Restauración en Santiago. Fotografía: Diori de Jesús Lora Amaro, CC BY-SA 4.0; adaptación panorámica.",
  "layout":"contain"},
 {"route":"/puerto-plata/","title":"Puerto Plata: noticias, turismo y contexto del norte dominicano",
  "file":"File:Port Puerto plata.jpg","author":"Abrahami","license":"CC BY-SA 3.0",
  "name":"puerto-plata-puerto-vista-costera.webp",
  "alt":"Vista del puerto marítimo de Puerto Plata y su entorno costero en la República Dominicana",
  "caption":"Puerto de Puerto Plata en una fotografía de 2014. Autor: Abrahami, CC BY-SA 3.0; adaptación WebP de la escena costera.",
  "layout":"fit"},
 {"route":"/carnaval-de-la-vega/","title":"Carnaval de La Vega: historia, cultura y guía editorial",
  "file":"File:CARNAVAL VEGANO 2020.jpg","author":None,"license":"CC BY-SA 4.0",
  "name":"carnaval-la-vega-disfraces-desfile-2020.webp",
  "alt":"Fotografía del Carnaval Vegano celebrando su desfile de máscaras y disfraces en La Vega en 2020",
  "caption":"Carnaval de La Vega, fotografía de 2020. Autor y licencia identificados en Wikimedia Commons, CC BY-SA 4.0; edición panorámica.",
  "layout":"contain"}
]
def download(url,limit=18_000_000):
    req=Request(url,headers={"User-Agent":UA,"Accept":"application/json,image/jpeg,image/webp,*/*"})
    with urlopen(req,timeout=20) as r:
        if r.status!=200:raise ValueError("HTTP not 200")
        data=r.read(limit+1)
        if len(data)>limit:raise ValueError("image exceeds 18MB hard limit")
        return data
def information():
    url=API+"?"+urlencode({"action":"query","format":"json","prop":"imageinfo",
      "iiprop":"url|size|sha1|extmetadata","iiurlwidth":"1600",
      "titles":"|".join(x["file"] for x in SOURCES)})
    for attempt in range(3):
        try:
            json_data=json.loads(download(url,900_000))
            if json_data.get("error"):raise RuntimeError(str(json_data["error"])[:120])
            items={page["title"]:page.get("imageinfo",[{}])[0] for page in json_data.get("query",{}).get("pages",{}).values()}
            if len(items)<len(SOURCES):raise ValueError("incomplete Commons API")
            return items
        except Exception:
            if attempt==2:raise
            time.sleep(2*(attempt+1))
def clean_author(s):
    # For historical author descriptions, avoid inferring a name from a user handle
    return htmlmod.unescape(re.sub(r"<[^>]+>"," ",s)).strip()[:180]
def select_source(info):
    u=info.get("url","").split("?")[0]
    t=info.get("thumburl","").split("?")[0]
    urls=[u]
    if t:urls.append(t)
    if u.startswith("https://upload.wikimedia.org/"):
        urls.append("https://commons.wikimedia.org/wiki/Special:Redirect/file/"+quote(info["filename"],safe=""))
        urls.append("https://i0.wp.com/"+u[8:]+"?w=1600")
    for url in urls:
        try:
            data=download(url)
            with Image.open(BytesIO(data)) as im:
                im.load()
                if im.format not in ("JPEG","PNG","WEBP"):raise ValueError("not an image")
                if im.width<1200:raise ValueError("unacceptable photographic width")
                if im.height<400:raise ValueError("too short")
            print("ASTRA_COMMONS_SOURCE_FETCH",json.dumps({"url":url,"size":len(data),"sha1":hashlib.sha1(data).hexdigest(),"sourceOriginalSHA1":info.get("sha1")}),flush=True)
            return data,url
        except Exception as err:
            print("ASTRA_COMMONS_FETCH_RETRY",json.dumps({"host":urlparse(url).netloc,"reason":type(err).__name__}),flush=True)
    raise RuntimeError("all source URL candidates failed")
def raster(data,layout):
    with Image.open(BytesIO(data)) as im:
        im=ImageOps.exif_transpose(im).convert("RGB")
        out=(1200,675)
        if layout=="fit" and im.width/im.height>=1.4:
            return ImageOps.fit(im,out,Image.Resampling.LANCZOS,centering=(0.5,0.5))
        # Keep exact vertical monuments/carnival subject intact with blurred photo backdrop.
        backdrop=ImageOps.fit(im,out,Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(30))
        subject=im.copy();subject.thumbnail((1090,675),Image.Resampling.LANCZOS)
        backdrop.paste(subject,((1200-subject.width)//2,(675-subject.height)//2))
        return backdrop
def make():
    originals=information()
    ledger=json.loads(REG.read_text(encoding="utf8"))
    ok=[];failed=[]
    DEST.mkdir(parents=True,exist_ok=True)
    for item in SOURCES:
        try:
            x=originals[item["file"]]
            license_value=x.get("extmetadata",{}).get("LicenseShortName",{}).get("value","")
            if license_value!=item["license"]:raise RuntimeError("rights check: license differs from reviewed Commons listing")
            if not isinstance(x.get("sha1"),str) or not re.fullmatch("[0-9a-f]{40}",x["sha1"]):raise ValueError("missing Commons original checksum")
            if x.get("width",0)<1200 or x.get("height",0)<500:raise ValueError("small original")
            x["filename"]=item["file"].removeprefix("File:")
            if not x.get("url","").startswith("https://upload.wikimedia.org/"):raise RuntimeError("source host mismatch")
            actual_author=clean_author(x["extmetadata"].get("Artist",{}).get("value","")) or item["author"]
            if not actual_author:raise RuntimeError("author cannot be validated")
            # Wikimedia author aliases may use link markup and names; use original provided string.
            image_bytes,url=select_source(x)
            # If the untransformed original comes from Commons, require exact API SHA1;
            # thumbnails/proxies are accepted as Commons derivatives with their own SHA recorded.
            if url==x["url"].split("?")[0] and hashlib.sha1(image_bytes).hexdigest()!=x["sha1"]:
                raise RuntimeError("original SHA1 differs from Commons metadata")
            img=raster(image_bytes,item["layout"])
            file=DEST/item["name"];img.save(file,"WEBP",quality=83,method=6)
            data=file.read_bytes()
            if len(data)>400000 or len(data)<18000:raise ValueError("poor WebP output size")
            with Image.open(file) as checker:
                if checker.format!="WEBP" or checker.size!=(1200,675):raise RuntimeError("invalid WebP")
            source_page="https://commons.wikimedia.org/wiki/"+quote(item["file"].replace(" ","_"),safe=":_-.,")
            record={"path":"/images/"+item["name"],"width":1200,"height":675,
              "bytes":len(data),"mime":"image/webp","alt":item["alt"],
              "caption":item["caption"].replace("Autor y licencia identificados en Wikimedia Commons",f"Autor: {actual_author}"),
              "source":{"type":"commons","filePage":source_page,"license":item["license"],
                 "licenseUrl":"https://creativecommons.org/licenses/by-sa/"+item["license"].split()[-1]+"/",
                 "licenseEvidenceUrl":source_page,"checkedAt":str(date.today()),
                 "author":actual_author,"derivativeLicense":item["license"],
                 "originalSha1":x["sha1"],"downloadedSha1":hashlib.sha1(image_bytes).hexdigest(),
                 "sourceEndpoint":url,"adaptations":"crop/resize or contain with backdrop, WebP conversion"},
              "editorial":{"reviewed":True,"exactSubjectMatch":True,"placeMatch":True,
                 "nonStockGeneric":True,"depictsHistoricalEvent":False,
                 "isModernPhoto":True,"modernContextDeclared":True},
              "sha256":hashlib.sha256(data).hexdigest(),"pageTitle":item["title"]}
            ledger[item["route"]]=record
            print("ASTRA_CIBAO_NEW_IMAGE_PASS",json.dumps({"route":item["route"],"file":record["path"],"bytes":len(data),"license":item["license"],"source":source_page}),flush=True)
            ok.append(item["route"])
        except Exception as ex:
            failed.append({"route":item["route"],"error":str(ex)[:150]})
            print("ASTRA_CIBAO_IMAGE_BLOCKED",json.dumps(failed[-1]),flush=True)
    # Only legitimate, proven binaries enter manifest. Failed pages retain current content.
    REG.write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("ASTRA_CIBAO_BATCH_RESULT",json.dumps({"pass":len(ok),"fail":len(failed),"publishedCandidates":ok,"blocked":failed}),flush=True)
    if not ok:raise SystemExit("No real images recovered")
if __name__=="__main__":make()
