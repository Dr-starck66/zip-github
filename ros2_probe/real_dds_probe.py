"""One-shot real ROS 2 DDS loopback proof for ASTRA SOULBRIDGE Ω.

Runs ONLY against a public, synthetic memory fixture in a container with no
robot hardware and no motor topics. Runs real rclpy with actual DDS messages,
not patched/mock ROS. Report is deliberately safe to expose via read-only HTTP.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from controllers.soulbridge_shared.robot_adapters import (
    RobotIdentity, SyntheticMemory, Transport, AdapterError,
)
from controllers.soulbridge_shared.ros2_text_adapter import Ros2TextAdapter


class Ros2ProbeFailure(RuntimeError):
    pass


def must(condition: bool, reason: str):
    if not condition:
        raise Ros2ProbeFailure(reason)


def digest(s: str) -> str:
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def pump(rclpy, nodes, seconds: float):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        for node in nodes:
            rclpy.spin_once(node, timeout_sec=0.012)


def run_real_ros2_probe(timeout: float = 22.0) -> dict:
    """Synchronous probe: two actual ROS nodes, two DDS topics each, observer."""
    must(os.environ.get('ROS_AUTOMATIC_DISCOVERY_RANGE') == 'LOCALHOST',
         'ROS_DISCOVERY_NOT_ISOLATED')
    must(os.environ.get('ROS_DOMAIN_ID') == '42', 'UNEXPECTED_ROS_DOMAIN')
    must(os.environ.get('ROS_DISTRO') == 'jazzy', 'UNEXPECTED_ROS_DISTRO')
    must(timeout >= 10.0, 'INVALID_TIMEOUT')
    import rclpy  # fail if real ROS 2 python runtime is not installed
    from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy
    from std_msgs.msg import String

    fixture = ROOT / 'data' / 'synthetic_capsule.json'
    memory = SyntheticMemory.from_file(fixture)
    probes = [
        Ros2TextAdapter(RobotIdentity('robotis_op2', 'Robotis', 'OP2', Transport.ROS2_TEXT), memory),
        Ros2TextAdapter(RobotIdentity('softbank_nao', 'SoftBank', 'NAO', Transport.ROS2_TEXT), memory),
    ]
    observer = None
    metrics: dict[str, list[str]] = {}
    try:
        for bridge in probes:
            bridge.start(consent=True)
        observer = rclpy.create_node('soulbridge_real_dds_observer')
        qos = QoSProfile(depth=10, reliability=ReliabilityPolicy.RELIABLE,
                         durability=DurabilityPolicy.VOLATILE)
        publishers = {}
        for bridge in probes:
            rid = bridge.identity.robot_id
            metrics[rid] = []
            publishers[rid] = observer.create_publisher(String, bridge.inbound_topic, qos)
            observer.create_subscription(
                String, bridge.outbound_topic,
                lambda message, rid=rid: metrics[rid].append(message.data),
                qos,
            )
        nodes = [observer, *(b._node for b in probes)]
        discovery_deadline = time.monotonic() + timeout
        while time.monotonic() < discovery_deadline:
            pump(rclpy, nodes, 0.09)
            ready = all(
                publishers[b.identity.robot_id].get_subscription_count() >= 1
                and observer.count_publishers(b.outbound_topic) >= 1
                for b in probes
            )
            if ready:
                break
        else:
            raise Ros2ProbeFailure('REAL_DDS_DISCOVERY_FAILED')

        questions = [
            ('known', 'Quel projet parle de Chicago ?'),
            ('unknown', 'Quel est le prénom du chien inexistant qui ne figure dans aucun souvenir ?'),
        ]
        dialogue_proofs = []
        for category, question in questions:
            before = {bridge.identity.robot_id: len(metrics[bridge.identity.robot_id])
                      for bridge in probes}
            msg = String()
            msg.data = question
            for bridge in probes:
                publishers[bridge.identity.robot_id].publish(msg)
            challenge_deadline = time.monotonic() + timeout
            while time.monotonic() < challenge_deadline:
                pump(rclpy, nodes, 0.09)
                if all(len(metrics[b.identity.robot_id]) > before[b.identity.robot_id]
                       for b in probes):
                    break
            else:
                raise Ros2ProbeFailure('DDS_TEXT_ROUNDTRIP_TIMEOUT_' + category.upper())

            replies = [metrics[b.identity.robot_id][before[b.identity.robot_id]]
                       for b in probes]
            must(replies[0] == replies[1], 'CROSS_PLATFORM_ANSWER_MISMATCH')
            local = memory.recall(question)
            must(replies[0] == local[2], 'RECALL_NOT_GROUNDED')
            must(bool(local[0]) == (category == 'known'), 'MISSING_MEMORY_GUARD_FAILED')
            dialogue_proofs.append({
                'case': category,
                'question_sha256': digest(question),
                'response_sha256': digest(replies[0]),
                'memory_found': bool(local[0]),
                'dds_messages_received': 2,
            })

        before_invalid = {b.identity.robot_id: len(metrics[b.identity.robot_id])
                          for b in probes}
        invalid = String()
        invalid.data = 'x' * 600  # > MAX_QUESTION
        for b in probes:
            publishers[b.identity.robot_id].publish(invalid)
        pump(rclpy, nodes, 0.6)
        must(all(b.last_error == 'ROS2_QUESTION_REJECTED' for b in probes),
             'INVALID_QUESTION_NOT_REJECTED')
        must(all(len(metrics[b.identity.robot_id]) == before_invalid[b.identity.robot_id]
                 for b in probes), 'INVALID_QUESTION_LEAKED_TO_OUTPUT')

        topics = {name for name, _ in observer.get_topic_names_and_types()}
        expected = {topic for b in probes
                    for topic in (b.inbound_topic, b.outbound_topic)}
        must(expected.issubset(topics), 'EXPECTED_ROS2_TOPICS_MISSING')
        must(not any(t in topics for t in
                     ('/cmd_vel', '/joint_trajectory', '/joint_states',
                      '/follow_joint_trajectory', '/motor_command')),
             'FORBIDDEN_MOTOR_TOPIC_PRESENT')
        must(all(b.memory.sha256 == probes[0].memory.sha256 for b in probes),
             'MEMORY_CAPSULE_MISMATCH')

        return {
            'status': 'REAL_ROS2_DDS_LOOPBACK_PASS',
            'timestamp_utc': datetime.now(timezone.utc).isoformat(),
            'environment': 'ROS 2 Jazzy OCI rootfs or container - actual rclpy/DDS',
            'discovery_restriction': 'ROS_DOMAIN_ID=42 and ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST',
            'not_network_firewall_isolation': True,
            'ros_distro': os.environ['ROS_DISTRO'],
            'ros_domain_id': 42,
            'ros_discovery_range': 'LOCALHOST',
            'dds_topics_observed': sorted(expected),
            'dds_text_messages_received': 4,
            'invalid_input_dropped': True,
            'profiles': [
                {'robot_id': b.identity.robot_id,
                 'manufacturer_label': b.identity.manufacturer,
                 'model_label': b.identity.model}
                for b in probes
            ],
            'tests': dialogue_proofs,
            'capsule_sha256': memory.sha256,
            'synthetic_only': True,
            'real_rclpy_and_dds': True,
            'two_simulated_manufacturer_profiles': True,
            'manufacturer_sdks_tested': False,
            'real_robots_tested': False,
            'motor_commands_enabled': False,
            'user_chatgpt_history_processed': False,
            'proof_scope': 'Two genuine ROS2 node endpoints, same DDS domain and same real ROS2 runtime.',
        }
    finally:
        if observer is not None:
            observer.destroy_node()
        for bridge in reversed(probes):
            bridge.close()


def main():
    try:
        report = run_real_ros2_probe()
    except Exception as exc:
        # Avoid ever publishing potentially sensitive exception content.
        report = {
            'status': 'REAL_ROS2_DDS_LOOPBACK_FAIL',
            'timestamp_utc': datetime.now(timezone.utc).isoformat(),
            'error_class': type(exc).__name__,
            'error_code': (str(exc)[:80] if isinstance(exc, Ros2ProbeFailure) else 'RUNTIME_ERROR'),
            'real_ros2_dds_pass': False,
            'synthetic_only': True,
        }
    report_path = Path(os.environ.get('SOULBRIDGE_REPORT_PATH', '/tmp/soulbridge-ros2-report.json'))
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(report, ensure_ascii=False, sort_keys=True), flush=True)
    return 0 if report['status'] == 'REAL_ROS2_DDS_LOOPBACK_PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
