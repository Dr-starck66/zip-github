"""Native ROS2 DDS/Qwen interoperability: two separate worker processes.

This is a real model and real rclpy DDS test. Platform labels do not imply SDKs,
separate robot simulators, machines, or real robot hardware. Only synthetic data.
"""
from __future__ import annotations
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from controllers.soulbridge_shared.robot_adapters import SyntheticMemory
from ros2_probe.qwen_ros_bridge import MODEL_ID,PROOF_PROVIDER,sha

REPORT=Path("/tmp/soulbridge-qwen-ros2-handoff-report.json")
WORKERS=("robotis_op2","softbank_nao")

class ProofError(ValueError):pass

def require(test,code):
    if not test:raise ProofError(code)

def run():
    require(os.environ.get("ROS_DOMAIN_ID")=="42"
            and os.environ.get("ROS_AUTOMATIC_DISCOVERY_RANGE")=="LOCALHOST",
            "DDS_SCOPE_NOT_LOCAL")
    require(os.environ.get("ROS_DISTRO")=="jazzy","NOT_REAL_ROS_JAZZY")
    import rclpy
    from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy
    from std_msgs.msg import String

    capsule=SyntheticMemory.from_file(ROOT/"data"/"synthetic_capsule.json")
    model_path=Path("/tmp/soulbridge-model/qwen2.5-1.5b-instruct-q4_k_m.gguf")
    # Only announce the model name after validating that llama.cpp responds.
    with urllib.request.urlopen("http://127.0.0.1:8080/health",timeout=5) as s:
        status=json.loads(s.read(16000))
    require(status.get("status")=="ok","LOCAL_QWEN_SERVER_UNHEALTHY")
    processes=[]
    logs=[]
    node=None
    results={rid:[] for rid in WORKERS}
    try:
        for rid in WORKERS:
            fp=open(f"/tmp/soulbridge-{rid}-qwen-worker.log","w")
            logs.append(fp)
            p=subprocess.Popen(
                [sys.executable,"-u","-m","ros2_probe.qwen_ros_worker","--id",rid],
                cwd=str(ROOT),env=os.environ.copy(),stdout=fp,stderr=subprocess.STDOUT)
            processes.append(p)
        rclpy.init(args=None)
        node=rclpy.create_node("soulbridge_qwen_handoff_supervisor")
        qos=QoSProfile(depth=10,reliability=ReliabilityPolicy.RELIABLE,
                       durability=DurabilityPolicy.VOLATILE)
        pubs={}
        for rid in WORKERS:
            pubs[rid]=node.create_publisher(String,f"/soulbridge/{rid}/operator_text",qos)
            node.create_subscription(String,f"/soulbridge/{rid}/assistant_text",
                lambda msg,rid=rid:results[rid].append(json.loads(msg.data)),qos)

        discovery_deadline=time.monotonic()+35
        while time.monotonic()<discovery_deadline:
            rclpy.spin_once(node,timeout_sec=0.1)
            require(all(p.poll() is None for p in processes),
                    "WORKER_CRASH_DURING_DISCOVERY")
            if all(pubs[rid].get_subscription_count()>=1
                   and node.count_publishers(f"/soulbridge/{rid}/assistant_text")>=1
                   for rid in WORKERS):break
        else:raise ProofError("TWO_PROCESSES_DDS_DISCOVERY_FAIL")

        def send(rid,question,history,request_id):
            request_payload={"request_id":request_id,"question":question,
                             "history":history,"capsule_sha256":capsule.sha256}
            msg=String()
            msg.data=json.dumps(request_payload,ensure_ascii=False)
            before=len(results[rid])
            pubs[rid].publish(msg)
            timeout=time.monotonic()+145
            while time.monotonic()<timeout:
                rclpy.spin_once(node,timeout_sec=0.1)
                require(all(p.poll() is None for p in processes),
                        "QWEN_WORKER_PROCESS_CRASH")
                new=[x for x in results[rid][before:]
                     if x.get("request_id")==request_id]
                if new:return new[0]
            raise ProofError("REAL_QWEN_DDS_REPLY_TIMEOUT_"+rid)

        first_question="Dans le projet fictif de dégustation de vins aux États-Unis, quelle ville est mentionnée ?"
        one=send(WORKERS[0],first_question,[],"soulbridge_turn_1")
        require(one.get("status")=="GENERATED_REAL_QWEN_ROS2"
                and one.get("provider")==PROOF_PROVIDER
                and one.get("generated_by_llm") is True
                and one.get("history_turns_in_prompt")==0,
                "FIRST_TURN_NOT_GENERATED_BY_QWEN")
        require("chicago" in one["model_answer"].casefold(),
                "FIRST_TURN_MEMORY_RECALL_FAIL")

        # Explicit, reconstructible transcript handoff from independent process A to B.
        history=[{"role":"user","content":first_question},
                 {"role":"assistant","content":one["model_answer"]}]
        second_question="Dans notre conversation juste avant, quelle ville avons-nous mentionnée ?"
        two=send(WORKERS[1],second_question,history,"soulbridge_turn_2")
        require(two.get("status")=="GENERATED_REAL_QWEN_ROS2"
                and two.get("provider")==PROOF_PROVIDER
                and two.get("generated_by_llm") is True
                and two.get("history_turns_in_prompt")==2,
                "SECOND_TURN_NOT_HANDED_OVER")
        require("chicago" in two["model_answer"].casefold(),
                "SECOND_TURN_CONTINUITY_FAIL")
        require(one["worker_pid"] != two["worker_pid"], "NOT_INDEPENDENT_OS_PROCESSES")
        require(one["capsule_sha256"]==two["capsule_sha256"]==capsule.sha256,
                "CAPSULE_CHANGED_ACROSS_PROCESSES")
        require(one["model_returned"]==two["model_returned"],
                "DIFFERENT_MODEL")
        require(one["model_answer_sha256"]==sha(one["model_answer"])
                and two["model_answer_sha256"]==sha(two["model_answer"]),
                "ANSWER_DIGEST_MISMATCH")
        require(pubs[WORKERS[0]].get_subscription_count()>=1
                and pubs[WORKERS[1]].get_subscription_count()>=1,
                "ROS2_ENDPOINT_DISCONNECTED")
        return {
            "status":"REAL_QWEN_ROS2_TWO_PROCESSES_MEMORY_HANDOFF_PASS",
            "timestamp_utc":datetime.now(timezone.utc).isoformat(),
            "model_backend":"llama.cpp local GGUF CPU real inference",
            "model":one["model_returned"],
            "model_source":"Qwen/Qwen2.5-1.5B-Instruct-GGUF",
            "capsule_sha256":capsule.sha256,
            "ros_distro":"jazzy","ros_domain_id":42,"dds_transport":"real rclpy / DDS",
            "two_independent_ros2_worker_processes":True,
            "processes":[{"robot_id":one["robot_id"],"pid":one["worker_pid"]},
                         {"robot_id":two["robot_id"],"pid":two["worker_pid"]}],
            "turns":[{"robot_id":one["robot_id"],"real_generated_answer":one["model_answer"],
                      "model_answer_sha256":one["model_answer_sha256"],
                      "history_turns_in_prompt":0,"recalled_known_fact":"Chicago"},
                     {"robot_id":two["robot_id"],"real_generated_answer":two["model_answer"],
                      "model_answer_sha256":two["model_answer_sha256"],
                      "history_turns_in_prompt":2,"recalled_known_fact":"Chicago"}],
            "handoff_history_sha256":sha(json.dumps(history,ensure_ascii=False)),
            "two_distinct_robot_simulators_tested":False,
            "two_independent_hosts_tested":False,
            "robot_manufacturer_sdk_tested":False,
            "physical_robots_tested":False,
            "real_user_history_used":False,
            "synthetic_fixture_only":True,
            "robot_actuation_enabled":False,
            "quality_scope":"Two real model generations, continuity heuristic not broad conversational benchmark"
        }
    finally:
        if node is not None:node.destroy_node()
        if rclpy.ok():rclpy.shutdown()
        for p in processes:
            if p.poll() is None:p.terminate()
        for p in processes:
            try:p.wait(timeout=4)
            except subprocess.TimeoutExpired:p.kill();p.wait(timeout=2)
        for fp in logs:fp.close()

def main():
    try:
        result=run()
    except Exception as exc:
        result={
            "status":"REAL_QWEN_ROS2_HANDOFF_FAIL",
            "error_type":type(exc).__name__,
            "code":str(exc) if isinstance(exc,ProofError) else "RUNTIME_ERROR",
            "timestamp_utc":datetime.now(timezone.utc).isoformat(),
            "real_qwen_ros2_handoff_pass":False
        }
    REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(result,ensure_ascii=False),flush=True)
    return 0 if result["status"]=="REAL_QWEN_ROS2_TWO_PROCESSES_MEMORY_HANDOFF_PASS" else 1

if __name__=="__main__":
    sys.exit(main())
