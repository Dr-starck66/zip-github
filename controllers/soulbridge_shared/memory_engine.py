"""Synthetic-only offline memory engine. Not a language model or consciousness transfer."""
import hashlib, json, re, unicodedata
from pathlib import Path
STOP = set("a ai au aux avec ce ces cet cette dans de des du elle en est et il je la le les ma mais me mes moi mon ne nos nous on ou par pas pour que qui sa se ses si son sur ta te tes toi ton tu un une vous vos votre what where when who why how the is are of in from this that and to".split())
def tokens(text):
    s = unicodedata.normalize("NFKD", text.casefold())
    return {w for w in re.findall(r"[a-z0-9]{3,}", "".join(c for c in s if not unicodedata.combining(c))) if w not in STOP}
def load_capsule(path):
    raw = Path(path).read_bytes()
    if len(raw)>150000: raise ValueError("SIZE_LIMIT")
    capsule=json.loads(raw)
    if capsule.get("schema")!="soulbridge.capsule.v1" or capsule.get("processing",{}).get("source")!="synthetic_fixture": raise ValueError("SYNTHETIC_ONLY")
    if not isinstance(capsule.get("memories"),str) or len(capsule.get("excerpts",[]))>18: raise ValueError("INVALID_CAPSULE")
    return capsule,hashlib.sha256(raw).hexdigest()
def retrieve(cap,question):
    q=tokens(question)
    lines=[("memory:"+str(i),s) for i,s in enumerate(cap["memories"].splitlines()) if s.strip()]
    lines += [("excerpt:"+str(i),x["text"]) for i,x in enumerate(cap["excerpts"])]
    ranks=sorted(((len(q & tokens(text)),id,text) for id,text in lines),reverse=True)
    if not q or not ranks or ranks[0][0]==0: return {"found":False,"source":None,"reply":"Je ne retrouve pas ce souvenir dans la capsule."}
    _,id,text=ranks[0]
    return {"found":True,"source":id,"reply":"Indice provenant de la capsule : "+text[:200]+" (souvenir synthétique, non vécu)."}
QUESTIONS=[
"Quel projet parle de Chicago ?",
"Quelle était la blague au sujet de Bordeaux ?",
"Que peut-on dire sur la station spatiale ?",
"Quelles sont les préférences de preuves de cet utilisateur ?"]
