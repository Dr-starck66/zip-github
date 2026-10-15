#!/usr/bin/env python3
"""Independent SHA-256, two-body and real-provider receipt verifier."""
import argparse,hashlib,json,pathlib,re,sys
a=argparse.ArgumentParser()
a.add_argument("--report",required=True)
args=a.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/"tests"))
from live_llm_dual import ASSETS, MODEL, grade, audit, memory_guard
report=json.loads(pathlib.Path(args.report).read_text())
if report.get("schema")!="soulbridge.real-llm-dual/1":raise RuntimeError("BAD_SCHEMA")
if report.get("synthetic_fixture") is not True or report.get("questions_selected_at_runtime") is not True:raise RuntimeError("NOT_BLIND_SYNTHETIC")
h=hashlib.sha256((root/"data"/"synthetic_capsule.json").read_bytes()).hexdigest()
if report.get("capsule_sha256")!=h:raise RuntimeError("SOURCE_FIXTURE_CHANGED")
identity=report["model"]
if identity["name"]!=MODEL or not re.fullmatch(r"(sha256:)?[a-f0-9]{64}",identity["digest"]):raise RuntimeError("NOT_VERIFIED_MODEL")
questions=report["questions"]
if len(questions)!=4 or set(x["id"] for x in questions)!={"chicago","bordeaux","evidence","unknown"}:raise RuntimeError("INVALID_QUESTIONS")
for s in report["sessions"]:
    if s["capsule_sha256"]!=h or s["asset"]!=ASSETS[s["platform"]] or s["physics_engine"]!="pybullet":raise RuntimeError("ROBOT_BODY_CAPSULE_MISMATCH")
    if s["model"]!=identity:raise RuntimeError("MODEL_SOURCE_MISMATCH")
    for q,turn in zip(questions,s["turns"]):
        if turn["question"]!=q["text"] or turn["id"]!=q["id"]:raise RuntimeError("QUESTION_MISMATCH")
        if hashlib.sha256(q["text"].encode()).hexdigest()!=turn["question_sha256"]:raise RuntimeError("QUESTION_HASH_BAD")
        if hashlib.sha256(turn["answer"].encode()).hexdigest()!=turn["answer_sha256"]:raise RuntimeError("MODEL_RESPONSE_HASH_BAD")
        if turn["quality_heuristic"]!=grade(q["id"],turn["answer"]):raise RuntimeError("QUALITY_SIGNAL_FAKED")
        raw=turn["raw_model_answer"]
        if turn["raw_model_answer_sha256"]!=hashlib.sha256(raw.encode()).hexdigest():raise RuntimeError("MODEL_OUTPUT_HASH_TAMPERED")
        if turn["model_quality_heuristic"]!=grade(q["id"],raw):raise RuntimeError("RAW_MODEL_SCORE_FAKED")
        expected,intervened=memory_guard(raw,turn["retrieval_fact_found"],q["id"])
        if turn["answer"]!=expected or turn["memory_guard_intervened"]!=intervened:raise RuntimeError("MEMORY_GUARD_BYPASSED")
        if turn["answer_source"]!=("memory_guard" if intervened else "llm"):raise RuntimeError("MISATTRIBUTED_GENERATION")
proof=audit(report["sessions"],questions)
if report["status"]!=proof["status"] or report["quality_hits"]!=proof["quality_hits"] or report["quality_status"]!=proof["quality_status"] or report["raw_model_hits"]!=proof["raw_model_hits"] or report["guard_interventions"]!=proof["guard_interventions"]:raise RuntimeError("FALSE_STATUS")
print(json.dumps({"status":"INDEPENDENT_REAL_LLM_TWO_ROBOTS_PASS","model":MODEL,"model_digest":identity["digest"],"memory_sha256":h,"models":list(ASSETS),"responses":8,"raw_model_hits":proof["raw_model_hits"],"guard_interventions":proof["guard_interventions"],"quality_hits":proof["quality_hits"],"quality_total":proof["quality_total"],"quality_status":proof["quality_status"],"disclaimer":"Quality heuristics are not a guarantee of grounding. True Qwen model, not ChatGPT, synthetic history only."},sort_keys=True))
