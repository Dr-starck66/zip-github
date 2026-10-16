"""Real generative Qwen dialogue transferred across TWO isolated ROS 2 DDS domains.

Each virtual robot runs in a different OS PROCESS and DDS domain (42 vs 43).
The supervisor is the explicit cross-domain memory bridge. Same host and same
ROS 2 distribution; two manufacturers' SDKs and robots are NOT tested.
"""
from __future__ import annotations

from datetime import datetime,timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from controllers.soulbridge_shared.robot_adapters import SyntheticMemory
from ros2_probe.qwen_ros_bridge import PROOF_PROVIDER, sha

REPORT=Path("/tmp/soulbridge-qwen-ros2-handoff-report.json")
DOMAINS={"robotis_op2":42,"softbank_nao":43}
WORKERS=tuple(DOMAINS)

class ProofError(ValueError): pass

def require(ok,code):
    if not ok: raise ProofError(code)

def run():
    require(os.environ.get("ROS_AUTOMATIC_DISCOVERY_RANGE")=="LOCALHOST",
            "DISCOVERY_ISOLATION_REQUIRED")
    require(os.environ.get("ROS_DISTRO")=="jazzy","ROS_JAZZY_REQUIRED")
    import rclpy
    from rclpy.context import Context
    from rclpy.qos import QoSProfile,ReliabilityPolicy,DurabilityPolicy
    from std_msgs.msg import String
    memory=SyntheticMemory.from_file(ROOT/"data"/"synthetic_capsule.json")
    with urllib.request.urlopen("http://127.0.0.1:18080/health",timeout=5) as res:
        state=json.loads(res.read(10000))
    require(state.get("status")=="ok","QWEN_LOCAL_SERVER_NOT_READY")
    children=[];log_files=[];contexts=[];nodes={};publishers={}
    answers={name:[] for name in WORKERS}
    try:
        for rid,domain in DOMAINS.items():
            log=open("/tmp/soulbridge-"+rid+"-qwen-worker.log","w")
            log_files.append(log)
            env=os.environ.copy()
            env["ROS_DOMAIN_ID"]=str(domain)
            env["ROS_AUTOMATIC_DISCOVERY_RANGE"]="LOCALHOST"
            child=subprocess.Popen([sys.executable,"-u","-m",
                                   "ros2_probe.qwen_ros_worker","--id",rid],
                                   cwd=str(ROOT),env=env,stdout=log,
                                   stderr=subprocess.STDOUT)
            children.append(child)
        for rid,domain in DOMAINS.items():
            context=Context()
            rclpy.init(args=None,context=context,domain_id=domain)
            contexts.append(context)
            node=rclpy.create_node("soulbridge_domain_"+str(domain)+"_observer",
                                   context=context)
            nodes[rid]=node
            qos=QoSProfile(depth=10,reliability=ReliabilityPolicy.RELIABLE,
                           durability=DurabilityPolicy.VOLATILE)
            publishers[rid]=node.create_publisher(
                String,"/soulbridge/"+rid+"/operator_text",qos)
            node.create_subscription(String,"/soulbridge/"+rid+"/assistant_text",
                lambda msg,rid=rid: answers[rid].append(json.loads(msg.data)),qos)

        def spin_both_once():
            for rid in WORKERS:
                rclpy.spin_once(nodes[rid],timeout_sec=0.04)

        discovery_until=time.monotonic()+40
        while time.monotonic()<discovery_until:
            spin_both_once()
            require(all(x.poll() is None for x in children),"ROS2_WORKER_CRASH")
            if all(publishers[rid].get_subscription_count()>=1 and
                   nodes[rid].count_publishers(
                       "/soulbridge/"+rid+"/assistant_text")>=1 for rid in WORKERS):
                break
        else:raise ProofError("TWO_DDS_DOMAINS_DISCOVERY_FAILED")

        # Negative discovery: each domain MUST NOT see the other's robot topics.
        a,b=WORKERS
        require(nodes[a].count_publishers("/soulbridge/"+b+"/assistant_text")==0
             and nodes[b].count_publishers("/soulbridge/"+a+"/assistant_text")==0,
             "CROSS_DOMAIN_DDS_LEAK")
        require(publishers[a].get_subscription_count()==1
             and publishers[b].get_subscription_count()==1,
             "UNEXPECTED_DDS_ENDPOINTS")

        def exchange(rid,question,history,request_id):
            m=String()
            m.data=json.dumps({"request_id":request_id,"question":question,
                               "history":history,"capsule_sha256":memory.sha256},
                              ensure_ascii=False)
            before=len(answers[rid])
            publishers[rid].publish(m)
            until=time.monotonic()+115
            while time.monotonic()<until:
                spin_both_once()
                require(all(x.poll() is None for x in children),"ROS2_WORKER_TERMINATED")
                found=[v for v in answers[rid][before:]
                       if v.get("request_id")==request_id]
                if found:return found[0]
            raise ProofError("QWEN_TIMEOUT_"+rid)

        q1="Dans le projet fictif de dégustation de vins aux États-Unis, quelle ville est mentionnée ?"
        r1=exchange(a,q1,[],"phase1")
        require(r1.get("generated_by_llm") is True and
                r1.get("status")=="GENERATED_REAL_QWEN_ROS2" and
                r1.get("provider")==PROOF_PROVIDER and
                r1.get("history_turns_in_prompt")==0 and
                "chicago" in r1.get("model_answer","").casefold(),
                "FIRST_REAL_MODEL_FACT_NOT_GROUNDED")
        # Portable dialogue context: transparent transfer by supervisor,
        # not a hidden shared LLM session or two processes seeing common RAM.
        transcript=[{"role":"user","content":q1},
                    {"role":"assistant","content":r1["model_answer"]}]
        q2="Dans notre conversation juste avant, quelle ville avons-nous mentionnée ?"
        r2=exchange(b,q2,transcript,"phase2")
        require(r2.get("generated_by_llm") is True and
                r2.get("status")=="GENERATED_REAL_QWEN_ROS2" and
                r2.get("provider")==PROOF_PROVIDER and
                r2.get("history_turns_in_prompt")==2 and
                "chicago" in r2.get("model_answer","").casefold(),
                "SECOND_REAL_MODEL_HANDOFF_NOT_GROUNDED")
        require(r1["worker_pid"]!=r2["worker_pid"],"PROCESS_NOT_INDEPENDENT")
        require(r1["capsule_sha256"]==r2["capsule_sha256"]==memory.sha256,
                "DIFFERENT_MEMORY_CAPSULES")
        require(r1["model_returned"]==r2["model_returned"],
                "NOT_SAME_MODEL")
        require(r1["model_answer_sha256"]==sha(r1["model_answer"])
             and r2["model_answer_sha256"]==sha(r2["model_answer"]),
             "GENERATED_HASH_INVALID")
        return {
            "status":"REAL_QWEN_ROS2_CROSS_DOMAIN_HANDOFF_PASS",
            "timestamp_utc":datetime.now(timezone.utc).isoformat(),
            "model_backend":"Local llama.cpp CPU with real Qwen2.5 1.5B GGUF Q4_K_M",
            "model":r1["model_returned"],
            "source":"Qwen/Qwen2.5-1.5B-Instruct-GGUF",
            "capsule_sha256":memory.sha256,
            "real_rclpy_dds":True,"ros_distro":"jazzy",
            "domain_A":DOMAINS[a],"domain_B":DOMAINS[b],
            "negative_cross_domain_dds_discovery_pass":True,
            "separate_worker_os_pids":[r1["worker_pid"],r2["worker_pid"]],
            "distinct_ros2_dds_domains":True,
            "handoff_via_explicit_transcript":True,
            "handoff_transcript_sha256":sha(json.dumps(transcript,ensure_ascii=False)),
            "turns":[{"robot_id":a,"model_answer":r1["model_answer"],
                      "model_answer_sha256":r1["model_answer_sha256"],
                      "context_turns_received":0,
                      "real_generation":True},
                     {"robot_id":b,"model_answer":r2["model_answer"],
                      "model_answer_sha256":r2["model_answer_sha256"],
                      "context_turns_received":2,
                      "real_generation":True}],
            "independent_physical_hosts_tested":False,
            "independent_robot_physics_engines_tested":False,
            "real_manufacturer_robots_tested":False,
            "chatgpt_export_loaded":False,
            "synthetic_only":True,
            "motor_commands_enabled":False,
            "scope":"Two independent process and DDS-domain endpoints on same host, shared synthetic capsule, one LLM service; NOT two physical robots."
        }
    finally:
        for node in nodes.values():
            node.destroy_node()
        for ctx in reversed(contexts):
            if ctx.ok():ctx.shutdown()
        for p in children:
            if p.poll() is None:p.terminate()
        for p in children:
            try:p.wait(timeout=5)
            except subprocess.TimeoutExpired:p.kill();p.wait()
        for f in log_files:f.close()

def main():
    try:report=run()
    except Exception as e:
        report={"status":"REAL_QWEN_ROS2_CROSS_DOMAIN_FAIL",
                "error_class":type(e).__name__,
                "reason":str(e) if isinstance(e,ProofError) else "RUNTIME_ERROR",
                "timestamp_utc":datetime.now(timezone.utc).isoformat()}
    REPORT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    print(json.dumps(report,ensure_ascii=False),flush=True)
    return 0 if report["status"]=="REAL_QWEN_ROS2_CROSS_DOMAIN_HANDOFF_PASS" else 1

if __name__=="__main__":sys.exit(main())
