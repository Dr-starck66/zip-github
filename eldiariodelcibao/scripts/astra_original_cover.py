#!/usr/bin/env python3
"""ASTRA image pilot: convert author's original documentary illustration to SEO WebP."""
from pathlib import Path
from PIL import Image
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
original=ROOT/"public"/"media"/"archivo-valverde-2018.png"
dest=ROOT/"public"/"images"/"esperanza-boca-mao-obras-protestas-2018.webp"
registry=ROOT/"data"/"image-manifest.json"
if not original.is_file():raise SystemExit("FAIL: own original image missing")
with Image.open(original) as im:
    if im.format!="PNG" or im.size!=(1200,675):raise SystemExit("FAIL: unexpected source format/dimensions")
    dest.parent.mkdir(parents=True,exist_ok=True)
    im.convert("RGB").save(dest,"WEBP",quality=81,method=6)
with Image.open(dest) as im:
    if im.format!="WEBP" or im.size!=(1200,675):raise SystemExit("FAIL: WebP output is malformed")
data=dest.read_bytes()
if len(data)>400000 or len(data)<5000:raise SystemExit("FAIL: WebP budget/proof")
record={
  "path":"/images/esperanza-boca-mao-obras-protestas-2018.webp",
  "width":1200,"height":675,"bytes":len(data),"mime":"image/webp",
  "alt":"Ilustración editorial del río y un puente de Valverde para contextualizar obras y protestas de Esperanza y Boca de Mao en 2018",
  "caption":"Ilustración editorial original de Valverde, creada para el reportaje histórico; no es una fotografía tomada en 2018.",
  "source":{"type":"original","author":"El Diario del Cibao — edición ASTRA",
    "proof":"author-approved","proofRef":"https://github.com/Dr-starck66/zip-github/commit/44ac746934ef631d2fcbf34206be693bc3c82c3e",
    "createdAt":"2026-10-12","license":"obra original para este periódico"},
  "editorial":{"reviewed":True,"exactSubjectMatch":True,"placeMatch":True,
    "nonStockGeneric":True,"depictsHistoricalEvent":False,"isModernPhoto":False,"modernContextDeclared":True},
  "sha256":hashlib.sha256(data).hexdigest(),"pageTitle":"Esperanza y Boca de Mao en junio de 2018: obras, protestas e identidad local"}
existing=json.loads(registry.read_text()) if registry.exists() else {}
existing["/archivo/2018/esperanza-boca-de-mao-obras-protestas/"]=record
registry.write_text(json.dumps(existing,ensure_ascii=False,indent=2)+"\n")
print("ASTRA_IMAGE_ORIGINAL_PASS",json.dumps({"file":str(dest),"bytes":len(data),"dimensions":[1200,675],"licenseProof":record["source"]["proofRef"]}))
