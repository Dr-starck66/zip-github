"""Separate real ROS2 process acting as a single text-only robot endpoint.

Two worker processes communicate through actual rclpy/DDS. No motor SDKs,
private ChatGPT history or synthetic stub model responses.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from controllers.soulbridge_shared.robot_adapters import RobotIdentity,SyntheticMemory,Transport
from controllers.soulbridge_shared.ros2_text_adapter import Ros2TextAdapter
from ros2_probe.qwen_ros_bridge import query_qwen

class RealQwenTextAdapter(Ros2TextAdapter):
    def _on_question(self, message):
        if self._node is None or self._publisher is None:
            return
        try:
            payload=json.loads(message.data)
            if not isinstance(payload,dict) or set(payload)!={
                    "request_id","question","history","capsule_sha256"}:
                raise ValueError("BAD_ENVELOPE")
            if (not isinstance(payload["request_id"],str)
                    or not 1<=len(payload["request_id"])<=36
                    or payload["capsule_sha256"]!=self.memory.sha256):
                raise ValueError("INVALID_REQUEST_ID_OR_CAPSULE")
            reply=query_qwen(self.memory,payload["question"],payload["history"])
            wire={"status":"GENERATED_REAL_QWEN_ROS2","robot_id":self.identity.robot_id,
                  "request_id":payload["request_id"],"worker_pid":os.getpid(),
                  **reply}
            from std_msgs.msg import String
            msg=String()
            msg.data=json.dumps(wire,ensure_ascii=False)
            self._publisher.publish(msg)
            self.last_error=None
        except Exception as e:
            self.last_error=type(e).__name__
            # Fails closed. Never turn an unavailable model into deterministic PASS.
            print(json.dumps({"event":"QWEN_ROS2_WORKER_REJECT",
                              "robot_id":self.identity.robot_id,
                              "error_class":self.last_error}),flush=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--id",required=True,choices=["robotis_op2","softbank_nao"])
    args=parser.parse_args()
    if (os.getenv("ROS_AUTOMATIC_DISCOVERY_RANGE")!="LOCALHOST"
        or os.getenv("ROS_DOMAIN_ID")!=({"robotis_op2":"42","softbank_nao":"43"}[args.id])):
        raise SystemExit("DDS_DISCOVERY_NOT_ISOLATED")
    mem=SyntheticMemory.from_file(ROOT/"data"/"synthetic_capsule.json")
    profiles={"robotis_op2":("Robotis","OP2"),"softbank_nao":("SoftBank","NAO")}
    name,model=profiles[args.id]
    adapter=RealQwenTextAdapter(RobotIdentity(args.id,name,model,Transport.ROS2_TEXT),mem)
    try:
        adapter.start(consent=True)
        print(json.dumps({"event":"REAL_ROS2_QWEN_WORKER_READY",
                          "robot_id":args.id,"pid":os.getpid(),"capsule_sha256":mem.sha256}),flush=True)
        while True:
            adapter.spin_once(timeout_sec=0.1)
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        from rclpy.executors import ExternalShutdownException
        if not isinstance(exc, ExternalShutdownException):
            raise
    finally:
        adapter.close()

if __name__=="__main__":
    main()
