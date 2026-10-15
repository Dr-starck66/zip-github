#!/usr/bin/env python3
import json,pathlib
p=pathlib.Path("logs")
a=json.loads((p/"pybullet-proof-humanoid.json").read_text())
b=json.loads((p/"pybullet-proof-mjcf.json").read_text())
assert a["status"]==b["status"]=="REMOTE_PHYSICS_MEMORY_PASS"
assert a["platform"]!=b["platform"] and a["asset"]!=b["asset"]
assert a["joints"]>=10 and b["joints"]>=10
assert a["capsule_sha256"]==b["capsule_sha256"]
assert a["question_sha256"]==b["question_sha256"]
assert a["found"]==b["found"]==[True,True,False,True]
report={"status":"REMOTE_PYBULLET_DUAL_PHYSICS_MEMORY_PASS","capsule_sha256":a["capsule_sha256"],"models":[a["asset"],b["asset"]],"physics_engines":["pybullet","pybullet"],"caveat":"Two distinct virtual humanoid URDF models. Synthetic deterministic recall only; not two software simulators, not live LLM and not commercial platform integration."}
(p/"remote-pybullet-dual-proof.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,sort_keys=True))
