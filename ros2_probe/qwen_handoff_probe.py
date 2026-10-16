"""Real generative Qwen dialogue transferred across TWO isolated ROS 2 DDS domains.

Each virtual robot runs in a different OS PROCESS and DDS domain (42 vs 43).
The supervisor is the explicit cross-domain memory bridge. Same host and same
ROS 2 distribution; two manufacturers' SDKs and robots are NOT tested.
"""
from __future__ import annotations

from datetime import datetime,timezone
import json
import os
import secrets
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from controllers.soulbridge_shared.robot_adapters import SyntheticMemory
from ros2_probe.qwen_ros_bridge import PROOF_PROVIDER, sha
from robot_models.kinematics import RobotDescription, compare_real_models

REPORT=Path("/tmp/soulbridge-qwen-ros2-handoff-report.json")
DOMAINS={"robotis_op3":42,"unitree_g1":43}
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
    from rclpy.executors import SingleThreadedExecutor
    from rclpy.qos import QoSProfile,ReliabilityPolicy,DurabilityPolicy
    from std_msgs.msg import String
    memory=SyntheticMemory.from_file(ROOT/"data"/"synthetic_capsule.json")
    model_A=RobotDescription.load(ROOT/'robot_models'/'robotis_op3.model.json')
    model_B=RobotDescription.load(ROOT/'robot_models'/'unitree_g1.model.json')
    description_proof=compare_real_models(model_A, model_B)
    require(description_proof['status']=='TWO_OFFICIAL_MANUFACTURER_KINEMATIC_PROFILES_PASS',
            'DISTINCT_AUTHENTIC_ROBOT_DESCRIPTIONS_REQUIRED')
    with urllib.request.urlopen("http://127.0.0.1:18080/health",timeout=5) as res:
        state=json.loads(res.read(10000))
    require(state.get("status")=="ok","QWEN_LOCAL_SERVER_NOT_READY")
    children=[];log_files=[];contexts=[];nodes={};publishers={};executors={}
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
            executor=SingleThreadedExecutor(context=context)
            executor.add_node(node)
            executors[rid]=executor
            qos=QoSProfile(depth=10,reliability=ReliabilityPolicy.RELIABLE,
                           durability=DurabilityPolicy.VOLATILE)
            publishers[rid]=node.create_publisher(
                String,"/soulbridge/"+rid+"/operator_text",qos)
            node.create_subscription(String,"/soulbridge/"+rid+"/assistant_text",
                lambda msg,rid=rid: answers[rid].append(json.loads(msg.data)),qos)

        def spin_both_once():
            for rid in WORKERS:
                executors[rid].spin_once(timeout_sec=0.04)

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
        # Stronger challenge: a RANDOM NEW synthetic code, absent from the capsule.
        # Without the explicit transferred conversation, robot B cannot infer it.
        codeword="AZUR-"+str(200+secrets.randbelow(700))
        require(codeword not in json.dumps(memory._capsule,ensure_ascii=False),
                "CODEWORD_ALREADY_IN_CAPSULE")
        partial_history=[{"role":"user","content":q1},
                         {"role":"assistant","content":r1["model_answer"]}]
        q_new=("Pour notre expérience fictive, retiens ce NOUVEAU code temporaire : "
               +codeword+". Confirme uniquement le code, sans autre mot.")
        r_new=exchange(a,q_new,partial_history,"phase2_new_fact")
        require(r_new.get("generated_by_llm") is True and
                r_new.get("provider")==PROOF_PROVIDER and
                r_new.get("history_turns_in_prompt")==2 and
                codeword.casefold() in r_new.get("model_answer","").casefold(),
                "MODEL_A_FAILED_TO_ACKNOWLEDGE_NEW_FACT")
        # Only now hand off all prior turns across DDS domains via supervisor.
        transcript=partial_history+[
            {"role":"user","content":q_new},
            {"role":"assistant","content":r_new["model_answer"]}]
        q2="Quel était exactement le NOUVEAU code fictif donné dans notre conversation précédente ?"
        require(codeword.casefold() not in q2.casefold(),
                "CODE_LEAK_IN_SECOND_QUESTION")
        r2=exchange(b,q2,transcript,"phase3_cross_domain")
        require(r2.get("generated_by_llm") is True and
                r2.get("status")=="GENERATED_REAL_QWEN_ROS2" and
                r2.get("provider")==PROOF_PROVIDER and
                r2.get("history_turns_in_prompt")==4 and
                codeword.casefold() in r2.get("model_answer","").casefold(),
                "NEW_MEMORY_NOT_TRANSFERRED_TO_DOMAIN_B")
        q3="Dans la mémoire initiale fictive, quelle ville des États-Unis était citée pour le vin ?"
        history_next=transcript+[
            {"role":"user","content":q2},
            {"role":"assistant","content":r2["model_answer"]}]
        r3=exchange(b,q3,history_next,"phase4_fixture_still_available")
        require(r3.get("generated_by_llm") is True and
                r3.get("provider")==PROOF_PROVIDER and
                r3.get("history_turns_in_prompt")==6 and
                "chicago" in r3.get("model_answer","").casefold(),
                "ORIGINAL_CAPSULE_LOST_AFTER_HANDOFF")
        # Bind each DDS text-generation worker to its authentic vendor kinematic tree.
        for payload,desc in ((r1,model_A),(r_new,model_A),(r2,model_B),(r3,model_B)):
            require(payload.get("actual_joint_tree_used") is True
                    and payload.get("motor_actions_exposed") is False
                    and payload.get("manufacturer_model_binding")==desc.profile_id
                    and payload.get("model_tree_sha256")==desc.fingerprint
                    and payload.get("model_source_commit")==desc.profile["source"]["commit"],
                    "REAL_MANUFACTURER_MODEL_BINDING_MISMATCH")
        require(r1["worker_pid"]==r_new["worker_pid"]
                and r2["worker_pid"]==r3["worker_pid"]
                and r1["worker_pid"]!=r2["worker_pid"],
                "PROCESS_INDEPENDENCE_FAILURE")
        require(all(x["capsule_sha256"]==memory.sha256
                    for x in (r1,r_new,r2,r3)),
                "CAPSULE_CHANGED_ACROSS_DOMAINS")
        require(len({x["model_returned"] for x in (r1,r_new,r2,r3)})==1,
                "MODEL_CHANGED_ACROSS_DOMAINS")
        require(all(x["model_answer_sha256"]==sha(x["model_answer"])
                    for x in (r1,r_new,r2,r3)),
                "GENERATED_HASH_INVALID")
        return {
            "status":"REAL_QWEN_ROS2_CROSS_DOMAIN_HANDOFF_PASS",
            "timestamp_utc":datetime.now(timezone.utc).isoformat(),
            "model_backend":"Local llama.cpp CPU with real Qwen2.5 1.5B GGUF Q4_K_M",
            "model":r1["model_returned"],
            "source":"Qwen/Qwen2.5-1.5B-Instruct-GGUF",
            "capsule_sha256":memory.sha256,
            "real_rclpy_dds":True,"ros_distro":"jazzy",
            "vendor_kinematic_model_proof":description_proof,
            "both_manufacturer_descriptions_loaded_and_used":True,
            "manufacturer_joint_models":["ROBOTIS OP3 20-DOF","Unitree G1 23-DOF"],
            "domain_A":DOMAINS[a],"domain_B":DOMAINS[b],
            "negative_cross_domain_dds_discovery_pass":True,
            "separate_worker_os_pids":[r1["worker_pid"],r2["worker_pid"]],
            "distinct_ros2_dds_domains":True,
            "handoff_via_explicit_transcript":True,
            "handoff_transcript_sha256":sha(json.dumps(transcript,ensure_ascii=False)),
            "novel_challenge_codeword":codeword,
            "novel_challenge_absent_from_initial_memory":True,
            "novel_challenge_absent_from_receiver_question":True,
            "generated_answer_count":4,
            "turns":[
                {"robot_id":a,"model_answer":r1["model_answer"],
                 "model_answer_sha256":r1["model_answer_sha256"],
                 "context_turns_received":0,"test":"original_capsule","real_generation":True},
                {"robot_id":a,"model_answer":r_new["model_answer"],
                 "model_answer_sha256":r_new["model_answer_sha256"],
                 "context_turns_received":2,"test":"new_random_fact","real_generation":True},
                {"robot_id":b,"model_answer":r2["model_answer"],
                 "model_answer_sha256":r2["model_answer_sha256"],
                 "context_turns_received":4,"test":"novel_fact_cross_domain","real_generation":True},
                {"robot_id":b,"model_answer":r3["model_answer"],
                 "model_answer_sha256":r3["model_answer_sha256"],
                 "context_turns_received":6,"test":"original_capsule_retained","real_generation":True}],
            "independent_physical_hosts_tested":False,
            "independent_robot_physics_engines_tested":False,
            "manufacturer_robot_description_files_tested":True,
            "real_manufacturer_sdk_integration_tested":False,
            "simulated_physics_actuation_tested":False,
            "real_manufacturer_robots_tested":False,
            "chatgpt_export_loaded":False,
            "synthetic_only":True,
            "motor_commands_enabled":False,
            "scope":"Two independent process and DDS-domain endpoints on same host, shared synthetic capsule, one LLM service; NOT two physical robots."
        }
    finally:
        for executor in executors.values():
            executor.shutdown()
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
