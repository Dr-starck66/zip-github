#!/usr/bin/env python3
"""Independent real remote pybullet physics headless demo, synthetic-only capsule."""
import argparse, hashlib, json, pathlib, sys
import pybullet as pb
import pybullet_data
from contextlib import contextmanager

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"controllers"/"soulbridge_shared"))
from memory_engine import load_capsule,retrieve,QUESTIONS

ASSETS={"humanoid":"humanoid/humanoid.urdf","atlas":"atlas/atlas_v4_with_multisense.urdf"}
parser=argparse.ArgumentParser()
parser.add_argument("--model",required=True,choices=tuple(ASSETS))
args=parser.parse_args()
cap,sha=load_capsule(ROOT/"data"/"synthetic_capsule.json")
client=pb.connect(pb.DIRECT)
if client<0:raise RuntimeError("PHYSICS_ENGINE_NOT_CONNECTED")
pb.setAdditionalSearchPath(pybullet_data.getDataPath())
pb.setGravity(0,0,-9.81)
pb.setTimeStep(1/240)
model_asset=ASSETS[args.model]
body=pb.loadURDF(model_asset,[0,0,1.4],useFixedBase=True)
if body<0:raise RuntimeError("ROBOT_ASSET_NOT_LOADED")
joints=pb.getNumJoints(body)
if joints<10:raise RuntimeError("ROBOT_NOT_HUMANOID_ENOUGH")
print(json.dumps({"event":"SOULBRIDGE_PHYSICS_BOOT","engine":"pybullet","platform":args.model,"asset":model_asset,"robot_id":body,"joints":joints,"capsule_sha256":sha,"synthetic_fixture":True}),flush=True)
for tick in range(16): pb.stepSimulation()
pose,orient=pb.getBasePositionAndOrientation(body)
if not all(abs(x)<100 for x in pose): raise RuntimeError("BAD_PHYSICS_POSE")
print(json.dumps({"event":"SOULBRIDGE_PHYSICS_STEP","engine":"pybullet","platform":args.model,"ticks":16,"joints":joints,"pose":pose,"capsule_sha256":sha}),flush=True)
for i,question in enumerate(QUESTIONS):
    result=retrieve(cap,question)
    print(json.dumps({"event":"SOULBRIDGE_PHYSICS_CHALLENGE","engine":"pybullet","platform":args.model,"capsule_sha256":sha,"question_id":i+1,"question_sha256":hashlib.sha256(question.encode()).hexdigest(),"found":result["found"],"source":result["source"],"no_actuation":True},sort_keys=True),flush=True)
pb.disconnect()
