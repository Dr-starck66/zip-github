#!/usr/bin/env python3
"""External log-only source-of-truth; reject hallucinated or missing physics evidence."""
import argparse,hashlib,json,pathlib
p=argparse.ArgumentParser()
p.add_argument("--model",choices=["humanoid","mjcf"],required=True)
p.add_argument("--log",required=True)
a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
h=hashlib.sha256((root/"data"/"synthetic_capsule.json").read_bytes()).hexdigest()
data=[]
for line in pathlib.Path(a.log).read_text(errors="replace").splitlines():
    try: obj=json.loads(line)
    except Exception: continue
    if isinstance(obj,dict) and str(obj.get("event","")).startswith("SOULBRIDGE_PHYSICS_"):data.append(obj)
boot=[x for x in data if x.get("event")=="SOULBRIDGE_PHYSICS_BOOT"]
steps=[x for x in data if x.get("event")=="SOULBRIDGE_PHYSICS_STEP"]
answers=[x for x in data if x.get("event")=="SOULBRIDGE_PHYSICS_CHALLENGE"]
dialogues=[]
for line in pathlib.Path(a.log).read_text(errors="replace").splitlines():
    try: obj=json.loads(line)
    except Exception: continue
    if isinstance(obj,dict) and obj.get("event")=="SOULBRIDGE_DIALOGUE_TURN":
        dialogues.append(obj)
assert len(boot)==1 and len(steps)==1 and len(answers)==4,"NO_GENUINE_PHYSICS_PROOF"
assert boot[0].get("synthetic_fixture") is True and boot[0].get("joints",0)>=10
assert steps[0].get("ticks",0)>=10 and steps[0].get("joints")==boot[0].get("joints")
assert [x.get("question_id") for x in answers]==[1,2,3,4]
assert [x.get("found") for x in answers]==[True,True,False,True], "NO_ANSWER_UNKNOWN_NOT_VERIFIED"
assert all(x.get("platform")==a.model and x.get("engine")=="pybullet" and x.get("capsule_sha256")==h for x in data)
assert all(x.get("no_actuation") is True for x in answers)
assert len(dialogues)==4,"DIALOGUE_ADAPTER_NOT_EXECUTED"
assert [x.get("question_id") for x in dialogues]==[1,2,3,4],"DIALOGUE_WRONG_QUESTIONS"
assert [x.get("question_sha256") for x in dialogues]==[x.get("question_sha256") for x in answers],"DIALOGUE_QUESTION_MISMATCH"
assert [x.get("memory_match") for x in dialogues]==[True,True,False,True],"DIALOGUE_MEMORY_MISMATCH"
assert all(x.get("provider")=="fixture_stub" and x.get("generated_by_llm") is False and x.get("proof_level")=="DETERMINISTIC_CONTRACT_ONLY" for x in dialogues),"FALSE_REAL_MODEL_CLAIM"
assert all(x.get("platform")==a.model and x.get("engine")=="pybullet" and x.get("capsule_sha256")==h for x in dialogues),"DIALOGUE_CAPSULE_MISMATCH"
assert all(x.get("no_actuation") is True and isinstance(x.get("reply_sha256"),str) and len(x["reply_sha256"])==64 for x in dialogues)
result={"status":"REMOTE_PHYSICS_MEMORY_PASS","platform":a.model,"asset":boot[0]["asset"],"engine":"pybullet","joints":boot[0]["joints"],"physics_steps":steps[0]["ticks"],"capsule_sha256":h,"question_sha256":[x["question_sha256"] for x in answers],"found":[x["found"] for x in answers],"dialogue_provider":"fixture_stub","generated_by_llm":False,"dialogue_question_sha256":[x["question_sha256"] for x in dialogues],"dialogue_reply_sha256":[x["reply_sha256"] for x in dialogues],"limits":"Real PyBullet robot step + shared dialogue transport, but synthetic deterministic stub responses, NOT live LLM or Webots or physical robot"}
out=pathlib.Path("logs");out.mkdir(exist_ok=True)
(out/("pybullet-proof-"+a.model+".json")).write_text(json.dumps(result,indent=2)+"\n")
print("REMOTE_PHYSICS_MEMORY_VERIFIED "+json.dumps(result,sort_keys=True))
