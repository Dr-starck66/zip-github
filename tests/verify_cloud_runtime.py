#!/usr/bin/env python3
"""Check actual Webots-controller logs. Never treat config/source as remote proof."""
import argparse, hashlib, json, pathlib, sys
p=argparse.ArgumentParser()
p.add_argument("--model",choices=("op2","nao"),required=True)
p.add_argument("--log",type=pathlib.Path,required=True)
p.add_argument("--capsule",type=pathlib.Path,default=pathlib.Path("data/synthetic_capsule.json"))
a=p.parse_args()
raw=a.log.read_text(errors="replace")
rows=[]
for line in raw.splitlines():
    if not line.startswith("{") or "SOULBRIDGE_" not in line: continue
    try: row=json.loads(line)
    except json.JSONDecodeError: continue
    if str(row.get("event","")).startswith("SOULBRIDGE_"): rows.append(row)
h=hashlib.sha256(a.capsule.read_bytes()).hexdigest()
model=a.model
expected_robot="SOULBRIDGE-"+model.upper()+"-01"
boot=[r for r in rows if r.get("event")=="SOULBRIDGE_BOOT"]
step=[r for r in rows if r.get("event")=="SOULBRIDGE_SIM_STEP"]
challenges=[r for r in rows if r.get("event")=="SOULBRIDGE_CHALLENGE"]
assert len(boot)==1 and len(step)==1 and len(challenges)==4, "Missing genuine Webots runtime events"
assert step[0].get("ticks")==3, "Physics step did not advance"
assert [x.get("question_id") for x in challenges]==[1,2,3,4], "Unexpected challenge sequence"
assert [x.get("found") for x in challenges]==[True,True,False,True], "Memory decisions incorrect"
for r in rows:
    assert r.get("platform")==model and r.get("robot")==expected_robot, "Robot identity mismatch"
    assert r.get("capsule_sha256")==h, "Capsule diverged"
    assert r.get("no_actuation") is True if r.get("event")!="SOULBRIDGE_SIM_STEP" else True
out={"status":"REMOTE_WEBOTS_LOG_VALIDATED","platform":model,"capsule_sha256":h,
     "robot":expected_robot,"steps":step[0]["ticks"],
     "question_sha256":[x["question_sha256"] for x in challenges],
     "found":[x["found"] for x in challenges]}
pathlib.Path("logs").mkdir(exist_ok=True)
pathlib.Path("logs/proof-"+model+".json").write_text(json.dumps(out,indent=2)+"\n")
print("SOULBRIDGE VERIFIED SIM LOG "+json.dumps(out,sort_keys=True))
