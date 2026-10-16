"""No paid-provider imports, no GitHub Actions, and no false ROS2 PASS."""
import copy
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / "tools" / "astra_runtime_omega.py"
spec = importlib.util.spec_from_file_location("astra_runtime_omega", PATH)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

def valid_report():
    return {
        "status":"REAL_QWEN_ROS2_CROSS_DOMAIN_HANDOFF_PASS",
        "real_rclpy_dds":True,
        "distinct_ros2_dds_domains":True,
        "negative_cross_domain_dds_discovery_pass":True,
        "handoff_via_explicit_transcript":True,
        "synthetic_only":True,
        "motor_commands_enabled":False,
        "domain_A":42,
        "domain_B":43,
        "turns":[{"real_generation":True,"model_answer":"réponse "+str(i)}
                 for i in range(4)],
        "both_manufacturer_descriptions_loaded_and_used":True,
        "two_different_vendor_urdf_skeletons_received_via_ros2_dds":True,
        "manufacturer_robot_description_files_tested":True,
        "vendor_joint_state_counts":[20,23],
    }

class NativeExecutionGateTests(unittest.TestCase):
    def test_real_full_proof_only(self):
        self.assertTrue(gate.verify_report(valid_report()))

    def test_no_stub_fallback(self):
        report=valid_report()
        report["turns"][1]["real_generation"]=False
        self.assertFalse(gate.verify_report(report))

    def test_no_fake_vendor_description(self):
        r=valid_report()
        r["two_different_vendor_urdf_skeletons_received_via_ros2_dds"]=False
        self.assertFalse(gate.verify_report(r))

    def test_refuse_single_dds_domain(self):
        r=valid_report()
        r["domain_B"]=r["domain_A"]
        self.assertFalse(gate.verify_report(r))

    def test_refuse_robot_motor_control(self):
        r=valid_report()
        r["motor_commands_enabled"]=True
        self.assertFalse(gate.verify_report(r))

    def test_refuse_private_capsule(self):
        r=valid_report()
        r["synthetic_only"]=False
        self.assertFalse(gate.verify_report(r))

    def test_missing_proof_is_never_pass(self):
        self.assertFalse(gate.verify_report({"status":"REAL_QWEN_ROS2_CROSS_DOMAIN_HANDOFF_PASS"}))

    def test_no_provider_dependency_or_billing(self):
        source=PATH.read_text()
        self.assertNotIn("mcp__Floot__",source)
        self.assertNotIn("mcp__Railway__",source)
        self.assertNotIn("GITHUB_TOKEN",source)
        self.assertNotIn("subprocess.run(['gh'",source)

if __name__=="__main__":
    unittest.main()
