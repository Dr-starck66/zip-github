import io
import json
import pathlib
import sys
import unittest
from urllib.error import HTTPError
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tests"))
from openai_bridge import BridgeError,load_demo_capsule,build_request,ask_openai,extract_text
CAP=load_demo_capsule(ROOT/"data"/"synthetic_capsule.json")
class Response:
    def __init__(self,payload):self.payload=payload
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self,n):return json.dumps(self.payload).encode()
def fake(req,timeout):
    assert req.full_url=="https://api.openai.com/v1/responses"
    assert timeout==25
    assert req.method=="POST"
    assert req.headers.get("Authorization")=="Bearer TEST_ONLY"
    body=json.loads(req.data)
    assert body["store"] is False
    assert body["max_output_tokens"]<=250
    assert "moteur" in body["instructions"]
    return Response({"output":[{"type":"message","content":[{"type":"output_text","text":"Je me souviens du slogan fictif de Bordeaux."}]}]})
class AdapterTests(unittest.TestCase):
    def test_fixture(self):self.assertEqual(CAP["processing"]["source"],"synthetic_fixture")
    def test_payload(self):
        p=build_request(CAP,"Quel souvenir ?")
        self.assertEqual(p["model"],"gpt-4.1-mini")
        self.assertFalse(p["store"])
    def test_not_live_no_network(self):
        with self.assertRaisesRegex(BridgeError,"LIVE_NETWORK_DISABLED"):
            ask_openai(CAP,"hello",api_key="TEST_ONLY",approved=True,transport=fake)
    def test_not_approved(self):
        with self.assertRaisesRegex(BridgeError,"REMOTE_MEMORY_CONSENT_REQUIRED"):
            ask_openai(CAP,"hello",live=True,api_key="TEST_ONLY",transport=fake)
    def test_missing_key(self):
        with self.assertRaisesRegex(BridgeError,"OPENAI_API_KEY_MISSING"):
            ask_openai(CAP,"hello",live=True,approved=True,api_key="",transport=fake)
    def test_fake_provider_success(self):
        ans=ask_openai(CAP,"Quelle blague ?",live=True,approved=True,api_key="TEST_ONLY",transport=fake)
        self.assertIn("Bordeaux",ans)
    def test_provider_error(self):
        with self.assertRaisesRegex(BridgeError,"PROVIDER_ERROR"):
            extract_text({"error":{"message":"denied"}})
    def test_no_output(self):
        with self.assertRaisesRegex(BridgeError,"EMPTY_MODEL_RESPONSE"):
            extract_text({"output":[]})
    def test_unknown_capsule(self):
        bad=dict(CAP);bad["processing"]={"source":"actual_history"}
        with self.assertRaisesRegex(BridgeError,"PUBLIC_DEMO_SYNTHETIC_ONLY"):
            build_request(bad,"hi")
    def test_huge_question(self):
        with self.assertRaisesRegex(BridgeError,"INVALID_QUESTION"):
            build_request(CAP,"x"*501)
    def test_context_limit(self):
        c=dict(CAP);c["memories"]="abc"*2500
        self.assertLessEqual(len(build_request(c,"hi")["input"][0]["content"][0]["text"]),6100)
    def test_http_fail_closed(self):
        def deny(req,timeout):raise HTTPError(req.full_url,401,"Unauthorized",None,None)
        with self.assertRaisesRegex(BridgeError,"OPENAI_HTTP_ERROR_401"):
            ask_openai(CAP,"hello",live=True,approved=True,api_key="TEST_ONLY",transport=deny)
    def test_no_motors_or_tools(self):
        x=build_request(CAP,"agis physiquement")
        self.assertNotIn("tools",x)
        self.assertNotIn("robot_action",json.dumps(x))
if __name__=="__main__":unittest.main()
