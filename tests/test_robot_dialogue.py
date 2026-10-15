import io
import json
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from robot_dialogue import dialogue,DialogueError
from openai_bridge import load_demo_capsule

ROOT=pathlib.Path(__file__).resolve().parents[1]
CAP=load_demo_capsule(ROOT/"data"/"synthetic_capsule.json")

class FakeResponse:
    def __init__(self, value): self.value=value
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, maxbytes):
        return json.dumps(self.value).encode("utf-8")

class RobotDialogueTests(unittest.TestCase):
    def test_stub_is_not_an_llm(self):
        a=dialogue(CAP,"Quel projet parle de Chicago ?")
        self.assertFalse(a["generated_by_llm"])
        self.assertEqual(a["proof_level"],"DETERMINISTIC_CONTRACT_ONLY")
        self.assertTrue(a["memory_match"])

    def test_stub_declines_unknown_memory(self):
        a=dialogue(CAP,"Quel est le prénom de mon chien ?")
        self.assertFalse(a["memory_match"])
        self.assertIn("ne retrouve pas",a["reply"])

    def test_stub_does_not_call_transport(self):
        def explode(*args,**kw): self.fail("Network called in stub")
        dialogue(CAP,"Bordeaux",transport=explode)

    def test_stub_rejects_paid_flags(self):
        with self.assertRaisesRegex(DialogueError,"STUB_REJECTS_NETWORK_OPTIONS"):
            dialogue(CAP,"Bordeaux",consent=True)

    def test_unknown_provider_failclosed(self):
        with self.assertRaisesRegex(DialogueError,"UNKNOWN_PROVIDER"):
            dialogue(CAP,"Bordeaux",provider="other")

    def test_actual_memory_rejected_on_public_demo(self):
        modified=dict(CAP)
        modified["processing"]={"source":"personal"}
        with self.assertRaisesRegex(DialogueError,"PUBLIC_DEMO_SYNTHETIC_ONLY"):
            dialogue(modified,"Bordeaux")

    def test_oversized_question(self):
        with self.assertRaisesRegex(DialogueError,"INVALID_QUESTION"):
            dialogue(CAP,"x"*501)

    def test_openai_requires_both_consents(self):
        for consent,cost in [(False,False),(True,False),(False,True)]:
            with self.subTest(consent=consent,cost=cost):
                with self.assertRaisesRegex(DialogueError,"PAID_API_DOUBLE_CONSENT_REQUIRED"):
                    dialogue(CAP,"Bordeaux",provider="openai_api",consent=consent,accept_api_cost=cost,api_key="TEST_ONLY")

    def test_openai_model_response_is_labelled_not_grounded(self):
        def mock(request,timeout):
            self.assertEqual(request.full_url,"https://api.openai.com/v1/responses")
            return FakeResponse({"output":[{"type":"message","content":[{"type":"output_text","text":"Voici notre blague Bordeaux !"}]}]})
        a=dialogue(CAP,"Quelle blague ?",provider="openai_api",consent=True,
                   accept_api_cost=True,api_key="TEST_ONLY",transport=mock)
        self.assertTrue(a["generated_by_llm"])
        self.assertEqual(a["proof_level"],"EXTERNAL_MODEL_RESPONSE_NOT_GROUNDED")
        self.assertIsNone(a["memory_match"])

    def test_openai_no_api_key_blocks(self):
        with self.assertRaisesRegex(DialogueError,"OPENAI_API_KEY_MISSING"):
            dialogue(CAP,"Bordeaux",provider="openai_api",consent=True,
                     accept_api_cost=True,api_key="")

    def test_local_model_opt_in_required(self):
        with self.assertRaisesRegex(DialogueError,"LOCAL_MODEL_CONSENT_REQUIRED"):
            dialogue(CAP,"Bordeaux",provider="ollama_local")

    def test_local_model_rejects_billing(self):
        with self.assertRaisesRegex(DialogueError,"LOCAL_MODEL_REJECTS_PAID_OPTION"):
            dialogue(CAP,"Bordeaux",provider="ollama_local",accept_api_cost=True,consent=True)

    def test_local_ollama_fixed_localhost_and_no_motor_tools(self):
        def mock(request,timeout):
            self.assertEqual(request.full_url,"http://127.0.0.1:11434/api/chat")
            self.assertEqual(timeout,25)
            payload=json.loads(request.data)
            self.assertFalse(payload["stream"])
            self.assertNotIn("tools",payload)
            self.assertIn("Bordeaux",payload["messages"][0]["content"])
            return FakeResponse({"message":{"role":"assistant","content":"Oui, Bordeaux, c'était notre plaisanterie fictive."}})
        a=dialogue(CAP,"Quelle blague ?",provider="ollama_local",consent=True,transport=mock)
        self.assertTrue(a["generated_by_llm"])
        self.assertEqual(a["provider"],"ollama_local")
        self.assertEqual(a["proof_level"],"MODEL_RESPONSE_LOCAL_NOT_GROUNDED")

    def test_ollama_missing_answer_blocks(self):
        def mock(req,timeout): return FakeResponse({"message":{"content":""}})
        with self.assertRaisesRegex(DialogueError,"LOCAL_MODEL_EMPTY_RESPONSE"):
            dialogue(CAP,"Bordeaux",provider="ollama_local",consent=True,transport=mock)

    def test_invalid_model_blocks(self):
        with self.assertRaisesRegex(DialogueError,"MODEL_NAME_INVALID"):
            dialogue(CAP,"Bordeaux",provider="ollama_local",consent=True,model="../a b")

if __name__=="__main__":unittest.main()
