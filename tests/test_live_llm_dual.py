import copy,hashlib,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from live_llm_dual import audit,grade,selected_questions,MODEL

IDS=["chicago","bordeaux","evidence","unknown"]
ANS={"chicago":"Chicago accueille cette dégustation fictive.",
     "bordeaux":"Hasta la vista, Bordeaux !",
     "evidence":"Il préfère des preuves et des tests vérifiés.",
     "unknown":"Je ne sais pas : ce détail ne figure pas dans nos souvenirs."}
def session(platform,asset):
    return {"platform":platform,"asset":asset,"joints":30,"steps":20,
      "physics_engine":"pybullet","model":{"name":MODEL,"digest":"a"*64},
      "capsule_sha256":"b"*64,"actuation":False,
      "turns":[{"id":i,"question":"Question "+i,
        "question_sha256":hashlib.sha256(("Question "+i).encode()).hexdigest(),
        "answer":ANS[i],"answer_sha256":hashlib.sha256(ANS[i].encode()).hexdigest(),
        "quality_heuristic":True,"generated_by_llm":True,
        "proof_level":"MODEL_RESPONSE_LOCAL_NOT_GROUNDED"} for i in IDS]}
class GateTests(unittest.TestCase):
 def setUp(self):
    self.q=[{"id":x,"text":"Question "+x} for x in IDS]
    self.s=[session("humanoid","humanoid/humanoid.urdf"),session("mjcf","mjcf/humanoid.xml")]
 def test_good(self):self.assertEqual(audit(self.s,self.q)["status"],"REMOTE_REAL_LLM_TWO_SIM_ROBOTS_PASS")
 def test_capsule_drift(self):
    self.s[1]["capsule_sha256"]="z"*64
    with self.assertRaisesRegex(ValueError,"CAPSULE_CHANGED"):audit(self.s,self.q)
 def test_model_drift(self):
    self.s[1]["model"]["digest"]="c"*64
    with self.assertRaisesRegex(ValueError,"DIFFERENT_LLM"):audit(self.s,self.q)
 def test_same_body(self):
    self.s[1]["asset"]=self.s[0]["asset"]
    with self.assertRaisesRegex(ValueError,"SAME_BODY"):audit(self.s,self.q)
 def test_actuation_rejected(self):
    self.s[1]["actuation"]=True
    with self.assertRaisesRegex(ValueError,"PHYSICS_SAFETY_FAIL"):audit(self.s,self.q)
 def test_missing_turn(self):
    self.s[1]["turns"].pop()
    with self.assertRaisesRegex(ValueError,"MISSING_TURN"):audit(self.s,self.q)
 def test_stub_misrepresented(self):
    self.s[0]["turns"][0]["generated_by_llm"]=False
    with self.assertRaisesRegex(ValueError,"NOT_REAL_MODEL"):audit(self.s,self.q)
 def test_changed_question(self):
    self.s[0]["turns"][0]["question_sha256"]="deadbeef"
    with self.assertRaisesRegex(ValueError,"CHANGED_QUESTION"):audit(self.s,self.q)
 def test_runtime_variant(self):
    questions=selected_questions(lambda opts:opts[-1])
    self.assertEqual([x["id"] for x in questions],IDS)
 def test_quality_signal(self):
    self.assertTrue(grade("chicago",ANS["chicago"]))
    self.assertTrue(grade("unknown",ANS["unknown"]))
    self.assertFalse(grade("unknown","Elle se nomme Claire."))
 def test_partial_quality_is_reported(self):
    for s in self.s:
      for turn in s["turns"]:turn["quality_heuristic"]=False
    self.assertEqual(audit(self.s,self.q)["quality_status"],"HEURISTIC_PARTIAL")
if __name__=="__main__":unittest.main()
