"""Real Webots virtual humanoid controller; synthetic memory, no motors."""
import hashlib, json, sys
from pathlib import Path
from controller import Robot
HERE=Path(__file__).resolve()
sys.path.insert(0,str(HERE.parents[1]/"soulbridge_shared"))
from memory_engine import load_capsule, retrieve, QUESTIONS
PLATFORM="op2"
IDENTITY="SOULBRIDGE-OP2-01"
robot=Robot()
if robot.getName()!=IDENTITY: raise RuntimeError("ROBOT_IDENTITY_MISMATCH")
capsule,sha=load_capsule(HERE.parents[2]/"data"/"synthetic_capsule.json")
step=int(robot.getBasicTimeStep())
print(json.dumps({"event":"SOULBRIDGE_BOOT","platform":PLATFORM,"robot":IDENTITY,"capsule_sha256":sha,"source":"synthetic_fixture","no_actuation":True}),flush=True)
ticks=0
while robot.step(step)!=-1:
    ticks+=1
    if ticks==3:
        print(json.dumps({"event":"SOULBRIDGE_SIM_STEP","platform":PLATFORM,"robot":IDENTITY,"capsule_sha256":sha,"ticks":ticks}),flush=True)
        for index,question in enumerate(QUESTIONS):
            answer=retrieve(capsule,question)
            print(json.dumps({"event":"SOULBRIDGE_CHALLENGE","platform":PLATFORM,"robot":IDENTITY,"capsule_sha256":sha,"question_id":index+1,"question_sha256":hashlib.sha256(question.encode("utf8")).hexdigest(),"found":answer["found"],"source":answer["source"],"reply":answer["reply"],"no_actuation":True},ensure_ascii=False),flush=True)
    if ticks>1800: break
