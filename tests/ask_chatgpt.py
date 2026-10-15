"""Manual one-shot ChatGPT-compatible API test. No API call without flags+key."""
import argparse
import json
import pathlib
import os
from openai_bridge import load_demo_capsule,ask_openai,BridgeError
p=argparse.ArgumentParser()
p.add_argument("--question",required=True)
p.add_argument("--live",action="store_true",help="Allow a single paid OpenAI API call")
p.add_argument("--consent",action="store_true",help="Explicitly consent to send synthetic memory to OpenAI")
p.add_argument("--model",default="gpt-4.1-mini")
args=p.parse_args()
path=pathlib.Path(__file__).resolve().parents[1]/"data"/"synthetic_capsule.json"
try:
    answer=ask_openai(load_demo_capsule(path),args.question,live=args.live,approved=args.consent,model=args.model)
    print(json.dumps({"status":"OPENAI_API_LIVE_RESPONSE","model":args.model,"answer":answer,
        "simulation":"no robot actuator involved","memory":"synthetic"},ensure_ascii=False))
except BridgeError as e:
    print(json.dumps({"status":"BLOCKED","reason":str(e),"cost_incurred":False}))
    raise SystemExit(1)
