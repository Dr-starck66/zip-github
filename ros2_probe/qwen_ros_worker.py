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
from robot_models.kinematics import RobotDescription
from robot_models.skeleton_urdf import export_skeleton_urdf, joint_state_snapshot

class RealQwenTextAdapter(Ros2TextAdapter):
    def __init__(self, identity, memory, model):
        super().__init__(identity, memory)
        self.kinematic_model = model
        self._joint_state_publisher = None
        self._urdf_publisher = None
        self._urdf_message = None
        self._joint_state_message = None

    def start(self, *, consent=False, allow_lan=False):
        super().start(consent=consent, allow_lan=allow_lan)
        from std_msgs.msg import String
        from sensor_msgs.msg import JointState
        from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy
        self._urdf_message = String()
        self._urdf_message.data = export_skeleton_urdf(self.kinematic_model)
        self._joint_state_message = JointState()
        snapshot = joint_state_snapshot(self.kinematic_model)
        self._joint_state_message.name = snapshot["name"]
        self._joint_state_message.position = snapshot["position"]
        self._joint_state_message.velocity = snapshot["velocity"]
        self._joint_state_message.effort = snapshot["effort"]
        self._urdf_publisher = self._node.create_publisher(
            String, f"/soulbridge/{self.identity.robot_id}/robot_description",
            QoSProfile(depth=1,reliability=ReliabilityPolicy.RELIABLE,
                       durability=DurabilityPolicy.TRANSIENT_LOCAL))
        self._joint_state_publisher = self._node.create_publisher(
            JointState, f"/soulbridge/{self.identity.robot_id}/joint_states",
            QoSProfile(depth=10,reliability=ReliabilityPolicy.RELIABLE,
                       durability=DurabilityPolicy.VOLATILE))

    def publish_kinematic_state(self):
        if self._joint_state_publisher is None or self._node is None:
            raise RuntimeError("KINEMATIC_PUBLISHER_NOT_STARTED")
        self._joint_state_message.header.stamp = self._node.get_clock().now().to_msg()
        self._urdf_publisher.publish(self._urdf_message)
        self._joint_state_publisher.publish(self._joint_state_message)

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
                  "manufacturer_model_binding":self.kinematic_model.profile_id,
                  "model_tree_sha256":self.kinematic_model.fingerprint,
                  "actual_joint_tree_used":True,
                  "motor_actions_exposed":False,
                  "model_source_commit":self.kinematic_model.profile["source"]["commit"],
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
    parser.add_argument("--id",required=True,choices=["robotis_op3","unitree_g1"])
    args=parser.parse_args()
    if (os.getenv("ROS_AUTOMATIC_DISCOVERY_RANGE")!="LOCALHOST"
        or os.getenv("ROS_DOMAIN_ID")!=({"robotis_op3":"42","unitree_g1":"43"}[args.id])):
        raise SystemExit("DDS_DISCOVERY_NOT_ISOLATED")
    mem=SyntheticMemory.from_file(ROOT/"data"/"synthetic_capsule.json")
    profiles={"robotis_op3":("ROBOTIS","OP3"),"unitree_g1":("Unitree","G1-23DOF")}
    name,model=profiles[args.id]
    description=RobotDescription.load(ROOT/"robot_models"/(args.id+".model.json"))
    # Actual manufacturer-provided joint tree, validated before any ROS2 topic starts.
    positions=description.forward({description.spec["knee"]:0.15})
    if description.spec["ankle"] not in positions:
        raise SystemExit("VENDOR_KINEMATIC_MODEL_INVALID")
    adapter=RealQwenTextAdapter(RobotIdentity(args.id,name,model,Transport.ROS2_TEXT),mem,description)
    try:
        adapter.start(consent=True)
        print(json.dumps({"event":"REAL_ROS2_QWEN_WORKER_READY",
                          "robot_id":args.id,"pid":os.getpid(),"capsule_sha256":mem.sha256,
                          "model_tree_sha256":description.fingerprint,
                          "real_vendor_model":description.profile_id,
                          "vendor_actuated_joint_count":description.spec["motors"]}),flush=True)
        import time
        next_state=time.monotonic()
        while True:
            adapter.spin_once(timeout_sec=0.1)
            if time.monotonic()>=next_state:
                adapter.publish_kinematic_state()
                next_state=time.monotonic()+0.4
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
