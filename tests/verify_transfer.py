#!/usr/bin/env python3
"""Cross-platform proof: require two independently captured Webots simulator logs."""
import hashlib,json,pathlib
p=pathlib.Path("logs")
a=json.loads((p/"proof-op2.json").read_text())
b=json.loads((p/"proof-nao.json").read_text())
assert a["status"]=="REMOTE_WEBOTS_LOG_VALIDATED"
assert b["status"]=="REMOTE_WEBOTS_LOG_VALIDATED"
assert a["platform"]=="op2" and b["platform"]=="nao"
assert a["robot"]!=b["robot"],"Robot platforms cannot be the same"
assert a["capsule_sha256"]==b["capsule_sha256"]
assert a["question_sha256"]==b["question_sha256"]
assert a["found"]==b["found"]==[True,True,False,True]
assert a["steps"]>0 and b["steps"]>0
result={"status":"REMOTE_DUAL_WEBOTS_TRANSFER_PASS","capsule_sha256":a["capsule_sha256"],
        "platforms":["robotis-op2","softbank-nao"],"challenge_count":len(a["found"]),
        "caveat":"Synthetic capsule/fixture, deterministic recall only. NOT a live LLM, full relationship transfer, or a physical robot"}
(p/"cross-platform-proof.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,sort_keys=True))
