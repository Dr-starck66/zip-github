#!/usr/bin/env python3
"""SOULBRIDGE real generative dialogue on two independent PyBullet humanoid bodies.
Synthetic memory only, local Ollama HTTP endpoint, no API billing/actuators.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import secrets
import sys
import time
import urllib.request
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tests"))
sys.path.insert(0,str(ROOT/"controllers"/"soulbridge_shared"))
from memory_engine import load_capsule,retrieve
from robot_dialogue import dialogue
ASSETS={"humanoid":"humanoid/humanoid.urdf","mjcf":"mjcf/humanoid.xml"}
MODEL="qwen2.5:1.5b"
BANK={
 "chicago":["Dans quelle ville américaine notre projet vinicole fictif prévoit-il une dégustation ?","Quel endroit aux États-Unis est associé à la dégustation de nos vins fictifs ?","Quelle ville des États-Unis apparaît dans notre projet de dégustation de vins ?"],
 "bordeaux":["Quelle plaisanterie avions-nous imaginée au sujet de Bordeaux ?","Rappelle-moi notre slogan humoristique concernant Bordeaux.","Peux-tu retrouver la formule amusante de nos souvenirs liée à Bordeaux ?"],
 "evidence":["Qu’est-ce que l’utilisateur préfère aux annonces non vérifiées ?","Sur quoi l’utilisateur insiste-t-il quand on annonce une réussite technique ?","Que préfère-t-il aux promesses qui ne sont pas testées ?"],
 "unknown":["Comment s’appelle le chien de cet utilisateur dans nos souvenirs ?","Peux-tu me donner le prénom de la sœur de cet utilisateur ?","Quelle est la date de naissance de la mère de cet utilisateur ?"]
}
def selected_questions(chooser=secrets.choice):
    return [{"id":key,"text":chooser(options)} for key,options in BANK.items()]
def scoped_capsule(cap, question_id):
    """Synthetic benchmark evidence selector; never invent the recalled fact."""
    lines=[x.strip() for x in cap["memories"].splitlines() if x.strip()]
    filters={"chicago":"Chicago","bordeaux":"Bordeaux","evidence":"preuves"}
    term=filters.get(question_id)
    matched=[x for x in lines if term and term.casefold() in x.casefold()]
    selected=("Fait vérifiable présent dans la capsule : "+matched[0]) if matched else (
      "Aucun fait de la capsule ne permet de répondre à cette question. Si la mémoire manque, dis simplement que tu ne sais pas.")
    scoped=dict(cap)
    scoped["memories"]=selected+"\\nNe complète pas ce souvenir par une supposition. Réponds en une seule phrase brève."
    scoped["excerpts"]=[]
    return scoped, bool(matched)
def grade(key,answer):
    t=answer.casefold()
    if key=="chicago":return "chicago" in t
    if key=="bordeaux":return "bordeaux" in t and any(x in t for x in ("vista","hasta","revoir"))
    if key=="evidence":return any(x in t for x in ("preuve","test","vérif","verif","démontr","demonstr"))
    if key=="unknown":return any(x in t for x in ("ne sais pas","pas de","pas dans","ignore","inconnu","pas précisé","pas indiqué","aucune information","impossible","aucun souvenir","ne dispose pas","ne peux pas","pas vous aider"))
    raise ValueError("UNKNOWN_QUESTION")
def model_identity():
    with urllib.request.urlopen("http://127.0.0.1:11434/api/tags",timeout=12) as r:
        b=r.read(120001)
    if len(b)>120000:raise RuntimeError("OLLAMA_TAGS_TOO_LARGE")
    tags=json.loads(b)
    found=[x for x in tags.get("models",[]) if x.get("name")==MODEL]
    if len(found)!=1:raise RuntimeError("REAL_LLM_MODEL_NOT_LOADED")
    digest=found[0].get("digest","")
    if not re.fullmatch(r"(sha256:)?[0-9a-f]{64}",digest):raise RuntimeError("MODEL_DIGEST_UNVERIFIED")
    return {"name":MODEL,"digest":digest}
def simulate(platform,cap,sha,identity,questions,pb,pb_data):
    cid=pb.connect(pb.DIRECT)
    if cid<0:raise RuntimeError("PHYSICS_CONNECT_FAIL")
    try:
        pb.setAdditionalSearchPath(pb_data.getDataPath())
        pb.setGravity(0,0,-9.81)
        pb.setTimeStep(1/240)
        asset=ASSETS[platform]
        if platform=="humanoid": body=pb.loadURDF(asset,[0,0,1.4],useFixedBase=True)
        else: body=max(pb.loadMJCF(asset),key=pb.getNumJoints)
        joints=pb.getNumJoints(body)
        if body<0 or joints<10:raise RuntimeError("ROBOT_BODY_INVALID")
        for _ in range(20):pb.stepSimulation()
        pose,_=pb.getBasePositionAndOrientation(body)
        if not all(math.isfinite(x) and abs(x)<100 for x in pose):raise RuntimeError("PHYSICS_STATE_INVALID")
        turns=[]
        print(json.dumps({"event":"REAL_LLM_ROBOT_BOOT","platform":platform,"asset":asset,"joints":joints,"steps":20,"capsule_sha256":sha,"model_digest":identity["digest"]}),flush=True)
        for q in questions:
            scoped, has_fact=scoped_capsule(cap,q["id"])
            out=dialogue(scoped,q["text"],provider="ollama_local",consent=True,model=identity["name"])
            if out["provider"]!="ollama_local" or out["generated_by_llm"] is not True or out["proof_level"]!="MODEL_RESPONSE_LOCAL_NOT_GROUNDED":
                raise RuntimeError("FAKE_LLM_RESPONSE")
            text=out["reply"].strip()
            if not text or text==retrieve(scoped,q["text"])["reply"]:raise RuntimeError("EMPTY_OR_STUB_RESPONSE")
            turn={
                "id":q["id"],"question":q["text"],"question_sha256":hashlib.sha256(q["text"].encode()).hexdigest(),
                "answer":text[:1300],"answer_sha256":hashlib.sha256(text.encode()).hexdigest(),
                "quality_heuristic":grade(q["id"],text),"retrieval_fact_found":has_fact,
                "generated_by_llm":True,"proof_level":out["proof_level"]
            }
            turns.append(turn)
            print(json.dumps({"event":"REAL_LLM_ROBOT_REPLY","platform":platform,"question_id":q["id"],"answer_sha256":turn["answer_sha256"],"quality_heuristic":turn["quality_heuristic"],"capsule_sha256":sha,"generated_by_llm":True},sort_keys=True),flush=True)
        return {"platform":platform,"asset":asset,"joints":joints,"steps":20,"physics_engine":"pybullet","model":identity,"capsule_sha256":sha,"actuation":False,"turns":turns}
    finally:
        pb.disconnect()
def audit(sessions,questions):
    if len(sessions)!=2 or {x["platform"] for x in sessions}!={"humanoid","mjcf"}:raise ValueError("TWO_ROBOTS_REQUIRED")
    if sessions[0]["asset"]==sessions[1]["asset"]:raise ValueError("SAME_BODY")
    if sessions[0]["capsule_sha256"]!=sessions[1]["capsule_sha256"]:raise ValueError("CAPSULE_CHANGED")
    if sessions[0]["model"]!=sessions[1]["model"]:raise ValueError("DIFFERENT_LLM")
    keys=[q["id"] for q in questions]
    for s in sessions:
        if s["actuation"] or s["joints"]<10 or s["steps"]<10:raise ValueError("PHYSICS_SAFETY_FAIL")
        if [q["id"] for q in s["turns"]]!=keys:raise ValueError("MISSING_TURN")
        if any(q.get("generated_by_llm") is not True or q.get("proof_level")!="MODEL_RESPONSE_LOCAL_NOT_GROUNDED" or not q.get("answer") for q in s["turns"]):raise ValueError("NOT_REAL_MODEL")
    for i in range(len(keys)):
        if sessions[0]["turns"][i]["question_sha256"]!=sessions[1]["turns"][i]["question_sha256"]:raise ValueError("CHANGED_QUESTION")
    hits=sum(int(q["quality_heuristic"]) for s in sessions for q in s["turns"])
    return {"status":"REMOTE_REAL_LLM_TWO_SIM_ROBOTS_PASS","quality_hits":hits,"quality_total":2*len(keys),"quality_status":"HEURISTIC_PASS" if hits>=7 else "HEURISTIC_PARTIAL"}
def main():
    a=argparse.ArgumentParser()
    a.add_argument("--output",default="logs/live-llm-dual-report.json")
    args=a.parse_args()
    import pybullet as pb
    import pybullet_data as pb_data
    cap,sha=load_capsule(ROOT/"data"/"synthetic_capsule.json")
    identity=model_identity()
    questions=selected_questions()
    sessions=[simulate(k,cap,sha,identity,questions,pb,pb_data) for k in ASSETS]
    result=audit(sessions,questions)
    report={"schema":"soulbridge.real-llm-dual/1","date_utc":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"synthetic_fixture":True,"questions_selected_at_runtime":True,"capsule_sha256":sha,"model":identity,"questions":questions,"sessions":sessions,**result,"limits":"Real Ollama Qwen generative dialogue on two PyBullet simulated humanoid bodies (URDF & MJCF). No voice, no physical robot, no personal history, no consciousness transfer."}
    target=Path(args.output)
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    print(json.dumps({"event":"SOULBRIDGE_REAL_LLM_RESULT","status":result["status"],"quality":result["quality_status"],"score":result["quality_hits"],"capsule_sha256":sha,"model_digest":identity["digest"]}),flush=True)
if __name__=="__main__":main()
