"""Self-contained, offline safety and interoperability contract tests."""
import contextlib
from dataclasses import replace
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from controllers.soulbridge_shared.robot_adapters import (
    AdapterError, DialogueResult, RobotIdentity, SimulationTextAdapter,
    SyntheticMemory, Transport, RobotAdapterRegistry, default_registry,
    verify_shared_capsule)
from controllers.soulbridge_shared.ros2_text_adapter import Ros2TextAdapter

CAPSULE = ROOT / 'data' / 'synthetic_capsule.json'


def memory():
    return SyntheticMemory.from_file(CAPSULE)


def virtual_robots(mem=None):
    mem = mem or memory()
    factory = default_registry()
    return (factory.build(RobotIdentity('robotis_op2', 'Robotis', 'OP2'), mem),
            factory.build(RobotIdentity('softbank_nao', 'SoftBank', 'NAO'), mem))


class RobotAdapterTests(unittest.TestCase):
    def test_two_different_vendor_labelled_endpoints_same_hash(self):
        a, b = virtual_robots()
        self.assertEqual(a.memory.sha256, b.memory.sha256)
        self.assertNotEqual(a.identity.manufacturer, b.identity.manufacturer)
        self.assertEqual(a.answer('Quel projet parle de Chicago ?').answer,
                         b.answer('Quel projet parle de Chicago ?').answer)

    def test_simulation_proof_is_honest(self):
        a, b = virtual_robots()
        result = verify_shared_capsule(a, b, 'Quel projet parle de Chicago ?')
        self.assertEqual(result['status'], 'SYNTHETIC_TEXT_ADAPTER_PASS')
        self.assertFalse(result['physical_robots_tested'])
        self.assertFalse(result['ros2_runtime_tested'])
        self.assertFalse(result['robot_actuation_enabled'])

    def test_unknown_memory_fail_closed(self):
        a, b = virtual_robots()
        result = a.answer('Quel est le nom du chien invisible ?')
        self.assertFalse(result.memory_found)
        self.assertIsNone(result.source)

    def test_no_manufacturer_sdk_or_motor_interface(self):
        a, b = virtual_robots()
        for instance in (a, b):
            self.assertEqual(instance.capabilities,
                             ('text_input', 'text_output', 'synthetic_memory', 'no_actuation'))
            for forbidden in ('set_joint', 'move', 'cmd_vel', 'execute', 'actuate', 'camera'):
                self.assertFalse(hasattr(instance, forbidden))

    def test_third_vendor_needs_no_core_change(self):
        mem = memory()
        another = default_registry().build(RobotIdentity('unitree_g1', 'Unitree', 'G1'), mem)
        self.assertTrue(another.answer('Quel projet parle de Chicago ?').memory_found)

    def test_private_export_capsule_rejected(self):
        import copy
        private = copy.deepcopy(memory()._capsule)
        private['processing']['source'] = 'chatgpt_export_local_private'
        with self.assertRaisesRegex(AdapterError, 'PRIVATE_OR_INVALID'):
            SyntheticMemory(private, '0' * 64)
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / 'capsule.json'
            f.write_text(json.dumps(private))
            with self.assertRaisesRegex(ValueError, 'SYNTHETIC_ONLY'):
                SyntheticMemory.from_file(f)

    def test_question_limit_rejects_empty_and_too_long(self):
        a, _ = virtual_robots()
        for q in ('', '  ', 'x' * 501):
            with self.subTest(q_len=len(q)), self.assertRaisesRegex(AdapterError, 'INVALID_QUESTION'):
                a.answer(q)

    def test_bad_ids_or_metadata_rejected(self):
        for rid in ('/robot', 'a/b', '../escape', 'R2', 'a', 'a-b', 'x'*33):
            with self.subTest(rid=rid), self.assertRaisesRegex(AdapterError, 'INVALID_ROBOT_ID'):
                RobotIdentity(rid, 'vendor', 'model')

    def test_closed_adapter_fail_closed(self):
        a, _ = virtual_robots()
        a.close()
        with self.assertRaisesRegex(AdapterError, 'ADAPTER_CLOSED'):
            a.answer('Chicago')

    def test_mismatched_capsule_rejected(self):
        a, b = virtual_robots()
        different = json.loads(CAPSULE.read_text())
        different['memories'] = 'Autre mémoire totalement synthétique.'
        other = SyntheticMemory(different, '1' * 64)
        b = SimulationTextAdapter(b.identity, other)
        with self.assertRaisesRegex(AdapterError, 'CAPSULE_MISMATCH'):
            verify_shared_capsule(a, b, 'Chicago')

    def test_duplicate_endpoint_ids_rejected(self):
        a, _ = virtual_robots()
        with self.assertRaisesRegex(AdapterError, 'TWO_DISTINCT'):
            verify_shared_capsule(a, a, 'Chicago')

    def test_default_registry_does_not_autostart_ros(self):
        reg = default_registry()
        with self.assertRaisesRegex(AdapterError, 'TRANSPORT_NOT_REGISTERED'):
            reg.build(RobotIdentity('robot_ros', 'generic', 'text', Transport.ROS2_TEXT), memory())

    def test_registry_no_implicit_overwrite(self):
        reg = default_registry()
        with self.assertRaisesRegex(AdapterError, 'DUPLICATE_TRANSPORT'):
            reg.register(Transport.SIMULATION, SimulationTextAdapter)


@contextlib.contextmanager
def fake_ros_modules():
    state = {'initialized': False, 'nodes': [], 'init': 0, 'shutdown': 0}
    rclpy = types.ModuleType('rclpy')
    qos = types.ModuleType('rclpy.qos')
    msgs = types.ModuleType('std_msgs')
    msgs_msg = types.ModuleType('std_msgs.msg')
    class String:
        def __init__(self):
            self.data = ''
    class QoSProfile:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
    class Policies:
        RELIABLE = 'reliable'
        VOLATILE = 'volatile'
    class Publisher:
        def __init__(self):
            self.published = []
        def publish(self, msg):
            self.published.append(msg.data)
    class Node:
        def __init__(self, name):
            self.name = name
            self.publishers = []
            self.subscriptions = []
            self.destroyed = False
        def create_publisher(self, msg_type, topic, qos_profile):
            p = Publisher()
            self.publishers.append((msg_type, topic, qos_profile, p))
            return p
        def create_subscription(self, msg_type, topic, callback, qos_profile):
            self.subscriptions.append((msg_type, topic, callback, qos_profile))
            return object()
        def destroy_node(self):
            self.destroyed = True
    def init(args=None):
        state['init'] += 1
        state['initialized'] = True
    def shutdown():
        state['shutdown'] += 1
        state['initialized'] = False
    def create_node(name):
        node = Node(name)
        state['nodes'].append(node)
        return node
    def spin_once(node, timeout_sec):
        state['spins'] = state.get('spins', 0) + 1
    rclpy.ok = lambda: state['initialized']
    rclpy.init = init
    rclpy.shutdown = shutdown
    rclpy.create_node = create_node
    rclpy.spin_once = spin_once
    qos.QoSProfile = QoSProfile
    qos.ReliabilityPolicy = Policies
    qos.DurabilityPolicy = Policies
    msgs_msg.String = String
    with patch.dict(sys.modules, {'rclpy': rclpy, 'rclpy.qos': qos,
                                  'std_msgs': msgs, 'std_msgs.msg': msgs_msg}):
        yield state, String


class Ros2AdapterTests(unittest.TestCase):
    def robot(self):
        return Ros2TextAdapter(RobotIdentity('robot_a', 'vendor', 'model', Transport.ROS2_TEXT), memory())

    def test_requires_consent_before_import(self):
        adapter = self.robot()
        with self.assertRaisesRegex(AdapterError, 'CONSENT_REQUIRED'):
            adapter.start()

    def test_domain_is_explicit(self):
        adapter = self.robot()
        with patch.dict(os.environ, {'ROS_AUTOMATIC_DISCOVERY_RANGE': 'LOCALHOST'}, clear=True):
            with self.assertRaisesRegex(AdapterError, 'ROS_DOMAIN_ID_REQUIRED'):
                adapter.start(consent=True)

    def test_default_rejects_lan_and_no_implicit_discovery(self):
        adapter = self.robot()
        with patch.dict(os.environ, {'ROS_DOMAIN_ID': '42'}, clear=True):
            with self.assertRaisesRegex(AdapterError, 'ROS_DISCOVERY_MUST_BE_LOCALHOST'):
                adapter.start(consent=True)

    def test_fake_ros2_bindings_publish_only_text_and_close(self):
        adapter = self.robot()
        with fake_ros_modules() as (state, String):
            with patch.dict(os.environ, {'ROS_DOMAIN_ID': '42',
                                         'ROS_AUTOMATIC_DISCOVERY_RANGE': 'LOCALHOST'}, clear=True):
                adapter.start(consent=True)
                node = state['nodes'][0]
                self.assertEqual(len(node.publishers), 1)
                self.assertEqual(len(node.subscriptions), 1)
                self.assertEqual(node.publishers[0][1], '/soulbridge/robot_a/assistant_text')
                self.assertEqual(node.subscriptions[0][1], '/soulbridge/robot_a/operator_text')
                cb = node.subscriptions[0][2]
                msg = String(); msg.data = 'Quel projet parle de Chicago ?'
                cb(msg)
                published = node.publishers[0][3].published
                self.assertEqual(len(published), 1)
                self.assertIn('Chicago', published[0])
                self.assertEqual(state['init'], 1)
                adapter.spin_once()
                self.assertEqual(state['spins'], 1)
                adapter.close()
                self.assertTrue(node.destroyed)
                self.assertEqual(state['shutdown'], 1)
                self.assertEqual(node.publishers[0][2].kwargs['durability'], 'volatile')

    def test_bad_message_dropped_and_not_echoed(self):
        adapter = self.robot()
        with fake_ros_modules() as (state, String):
            with patch.dict(os.environ, {'ROS_DOMAIN_ID': '42',
                                         'ROS_AUTOMATIC_DISCOVERY_RANGE': 'LOCALHOST'}, clear=True):
                adapter.start(consent=True)
                cb = state['nodes'][0].subscriptions[0][2]
                msg = String(); msg.data = 'x' * 600
                cb(msg)
                self.assertEqual(state['nodes'][0].publishers[0][3].published, [])
                self.assertEqual(adapter.last_error, 'ROS2_QUESTION_REJECTED')
                adapter.close()

    def test_already_started_error(self):
        adapter = self.robot()
        with fake_ros_modules():
            with patch.dict(os.environ, {'ROS_DOMAIN_ID': '42', 'ROS_AUTOMATIC_DISCOVERY_RANGE':'LOCALHOST'}, clear=True):
                adapter.start(consent=True)
                with self.assertRaisesRegex(AdapterError, 'ALREADY_STARTED'):
                    adapter.start(consent=True)
                adapter.close()

    def test_does_not_shutdown_preexisting_ros_context(self):
        adapter = self.robot()
        with fake_ros_modules() as (state, _):
            state['initialized'] = True
            with patch.dict(os.environ, {'ROS_DOMAIN_ID': '42', 'ROS_AUTOMATIC_DISCOVERY_RANGE':'LOCALHOST'}, clear=True):
                adapter.start(consent=True)
                adapter.close()
            self.assertEqual(state['shutdown'], 0)
            self.assertEqual(state['init'], 0)

    def test_invalid_spin_timeout(self):
        adapter = self.robot()
        with fake_ros_modules():
            with patch.dict(os.environ, {'ROS_DOMAIN_ID': '42', 'ROS_AUTOMATIC_DISCOVERY_RANGE':'LOCALHOST'}, clear=True):
                adapter.start(consent=True)
                with self.assertRaisesRegex(AdapterError, 'SPIN_TIMEOUT_LIMIT'):
                    adapter.spin_once(timeout_sec=10)
                adapter.close()


if __name__ == '__main__':
    unittest.main()
