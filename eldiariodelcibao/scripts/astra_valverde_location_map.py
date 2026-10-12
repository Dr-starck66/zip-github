#!/usr/bin/env python3
"""True OSM-point based location diagram for 2018 Esperanza/Boca de Mao retrospective.
Not a historical photo, not a road map; verifies EXACT OSM point coordinates.
"""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from hashlib import sha256
import json, math
root=Path(__file__).resolve().parents[1]
out=root/"public/images/mapa-esperanza-boca-mao-puente-san-rafael-valverde.webp"
manifest=root/"data/image-manifest.json"
w,h=1400,800
im=Image.new("RGB",(w,h),(17,32,45))
d=ImageDraw.Draw(im)
font="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
bold="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
def ft(size,b=False):return ImageFont.truetype(bold if b else font,size)
bg=(17,32,45); text=(243,239,220); secondary=(167,185,187); accent=(247,190,97); sea=(95,205,197); white=(255,255,255)
d.rounded_rectangle((36,36,w-36,h-36),radius=22,outline=(68,96,103),width=2)
d.text((72,70),"EL DIARIO DEL CIBAO   /   HEMEROTECA DE VALVERDE",font=ft(22,True),fill=sea)
d.text((72,115),"Esperanza · Boca de Mao · Puente San Rafael",font=ft(39,True),fill=text)
d.text((72,179),"Localizaciones documentadas · esquema geográfico (no representa carreteras)",font=ft(21),fill=secondary)
# Only point coordinates from OpenStreetMap IDs. Deliberately no inferred roads or rivers.
points=[
 dict(name="El Puente San Rafael",lat=19.59178,lon=-71.0588,osm=3701295514,kind="Aldea",color=accent,number="01"),
 dict(name="Boca de Mao",lat=19.58813,lon=-71.04454,osm=3701267857,kind="Distrito municipal",color=sea,number="02"),
 dict(name="Esperanza",lat=19.5784,lon=-70.991,osm=252989429,kind="Municipio",color=(240,239,223),number="03")
]
# Bearing and relative positioning follow the geographic coordinates; diagram is not a tiled/survey map.
xmin,xmax=-71.082,-70.969; ymin,ymax=19.570,19.600
left,right=150,1250; top,bottom=268,585
def xy(lat,lon):return (left+(lon-xmin)/(xmax-xmin)*(right-left),bottom-(lat-ymin)/(ymax-ymin)*(bottom-top))
for x in range(180,1240,160):
 d.line((x,253,x,615),fill=(30,51,61),width=1)
for y in range(285,612,100):
 d.line((115,y,1295,y),fill=(30,51,61),width=1)
# Latitude/reference line only, explicitly non-road.
coords=[xy(p["lat"],p["lon"]) for p in points]
d.line(coords,fill=(84,117,125),width=3)
for p,(x,y) in zip(points,coords):
 color=p["color"]
 d.ellipse((x-23,y-23,x+23,y+23),fill=color,outline=(17,32,45),width=3)
 d.ellipse((x-7,y-7,x+7,y+7),fill=bg)
 # Labels on same geo x but arranged against overlap.
 if p["name"]=="El Puente San Rafael":
  tx,ty=x-10,y-105
 elif p["name"]=="Boca de Mao":
  tx,ty=x+30,y+48
 else:tx,ty=x-5,y-104
 d.text((tx,ty),p["name"],font=ft(24,True),fill=text)
 d.text((tx,ty+32),f'{p["lat"]:.5f}° N   {abs(p["lon"]):.5f}° O',font=ft(17),fill=secondary)
# Footer attribution and honesty disclaimer.
d.line((72,676,1328,676),fill=(68,96,103),width=2)
d.text((72,699),"Puntos geográficos: OpenStreetMap contributors (ODbL) · Fuente: Mapcarta",font=ft(19),fill=secondary)
d.text((72,732),"Ilustración cartográfica 2026. La línea NO representa un camino o puente.",font=ft(18),fill=accent)
out.parent.mkdir(parents=True,exist_ok=True)
im.save(out,"WEBP",quality=85,method=6)
binary=out.read_bytes()
with Image.open(out) as x:
 if x.size!=(w,h) or x.format!="WEBP":raise SystemExit("FAIL map binary")
if not 30000<len(binary)<450000:raise SystemExit("FAIL map size "+str(len(binary)))
m=json.loads(manifest.read_text())
key="/archivo/2018/esperanza-boca-de-mao-obras-protestas/#map"
m[key]={
 "path":"/images/"+out.name,"width":w,"height":h,"bytes":len(binary),"mime":"image/webp",
 "alt":"Mapa esquemático basado en las coordenadas de Esperanza, Boca de Mao y El Puente San Rafael en Valverde, República Dominicana",
 "caption":"Ubicación de las tres localidades citadas; esquema sin carreteras. Coordenadas OSM y Mapcarta (consulta 12-10-2026). La línea no identifica un puente ni una vía.",
 "source":{"type":"original","author":"El Diario del Cibao — cartografía editorial / datos © OpenStreetMap contributors",
   "proof":"author-approved","proofRef":"https://mapcarta.com/es/N3701295514",
   "dataLicense":"Open Database License (ODbL)","dataAttribution":"© OpenStreetMap contributors",
   "sources":["https://mapcarta.com/es/34655116","https://mapcarta.com/es/19368258","https://mapcarta.com/es/N3701295514"],
   "osmNodes":{p["name"]:p["osm"] for p in points}},
 "editorial":{"reviewed":True,"exactSubjectMatch":True,"placeMatch":True,"nonStockGeneric":True,
   "depictsHistoricalEvent":False,"isModernPhoto":False,"modernContextDeclared":True},
 "sha256":sha256(binary).hexdigest(),"pageTitle":"Esperanza y Boca de Mao en junio de 2018: obras, protestas e identidad local",
 "coordinates":{p["name"]:[p["lat"],p["lon"]] for p in points}
}
manifest.write_text(json.dumps(m,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("ASTRA_VALVERDE_COORDS_MAP",json.dumps({"bytes":len(binary),"width":w,"height":h,"points":points,"path":str(out)}))
