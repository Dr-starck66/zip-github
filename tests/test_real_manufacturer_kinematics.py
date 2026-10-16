"""Offline ROS-free verification of two authentic vendor kinematic descriptions.

DOES NOT verify physical robots, manufacturer SDK drivers, motor controllers,
or runtime ROS2 integration. Those need dedicated evidence gates.
"""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from robot_models.kinematics import RobotDescription,ModelValidationError,compare_real_models


def load(name):
    return RobotDescription.load(ROOT/"robot_models"/(name+".model.json"))


class ManufacturerProfileTests(unittest.TestCase):
    def test_vendor_provenance_and_distinctness(self):
        a,b=load("robotis_op3"),load("unitree_g1")
        self.assertEqual(a.profile["source"]["repository"],"ROBOTIS-GIT/ROBOTIS-OP3-Common")
        self.assertEqual(b.profile["source"]["repository"],"unitreerobotics/unitree_ros")
        self.assertNotEqual(a.profile["source"]["commit"],b.profile["source"]["commit"])

    def test_true_actuated_joint_counts(self):
        self.assertEqual(sum(j["type"]!="fixed" for j in load("robotis_op3").joints.values()),20)
        self.assertEqual(sum(j["type"]!="fixed" for j in load("unitree_g1").joints.values()),23)

    def test_robot_models_have_distinct_kinematics(self):
        report=compare_real_models(load("robotis_op3"),load("unitree_g1"))
        self.assertEqual(report["status"],"TWO_OFFICIAL_MANUFACTURER_KINEMATIC_PROFILES_PASS")
        self.assertNotEqual(report["models"][0]["joint_tree_sha256"],report["models"][1]["joint_tree_sha256"])
        self.assertGreater(report["models"][0]["end_effector_displacement_m"],0.001)
        self.assertGreater(report["models"][1]["end_effector_displacement_m"],0.001)

    def test_no_hardware_motor_claim(self):
        report=compare_real_models(load("robotis_op3"),load("unitree_g1"))
        self.assertFalse(report["real_manufacturer_hardware_tested"])
        self.assertFalse(report["motor_commands_enabled"])
        self.assertEqual(report["physics_engines_tested"],0)

    def test_same_model_disallowed(self):
        a=load("robotis_op3")
        with self.assertRaisesRegex(ModelValidationError,"DISTINCT_MANUFACTURERS_REQUIRED"):
            compare_real_models(a,a)

    def test_unknown_vendor_rejected(self):
        x=copy.deepcopy(load("robotis_op3").profile)
        x["profile_id"]="made_up_vendor"
        with self.assertRaisesRegex(ModelValidationError,"UNKNOWN_MANUFACTURER_PROFILE"):
            RobotDescription(x)

    def test_spoofed_upstream_commit_rejected(self):
        x=copy.deepcopy(load("unitree_g1").profile)
        x["source"]["commit"]="f"*40
        with self.assertRaisesRegex(ModelValidationError,"UNVERIFIED_PROFILE"):
            RobotDescription(x)

    def test_motor_flag_rejected(self):
        x=copy.deepcopy(load("robotis_op3").profile)
        x["motor_control_enabled"]=True
        with self.assertRaisesRegex(ModelValidationError,"UNVERIFIED_PROFILE"):
            RobotDescription(x)

    def test_joint_count_tamper_rejected(self):
        x=copy.deepcopy(load("unitree_g1").profile)
        x["joints"].pop()
        with self.assertRaisesRegex(ModelValidationError,"MODEL_JOINT_COUNT_MISMATCH|DISCONNECTED"):
            RobotDescription(x)

    def test_duplicate_child_rejected(self):
        x=copy.deepcopy(load("robotis_op3").profile)
        x["joints"][1]["child"]=x["joints"][0]["child"]
        with self.assertRaisesRegex(ModelValidationError,"JOINT_TREE"):
            RobotDescription(x)

    def test_over_limit_joint_position_rejected(self):
        model=load("unitree_g1")
        j=model.joints[model.spec["knee"]]
        with self.assertRaisesRegex(ModelValidationError,"JOINT_LIMIT_EXCEEDED"):
            model.forward({j["name"]:j["upper"]+1.0})

    def test_unknown_motion_command_rejected(self):
        model=load("robotis_op3")
        with self.assertRaisesRegex(ModelValidationError,"UNKNOWN_POSE_JOINT"):
            model.forward({"cmd_vel":12})

    def test_fixed_joint_motion_rejected(self):
        model=load("unitree_g1")
        fixed=next(j["name"] for j in model.joints.values() if j["type"]=="fixed")
        with self.assertRaisesRegex(ModelValidationError,"FIXED_JOINT_MOVEMENT_REJECTED"):
            model.forward({fixed:1.0})

    def test_kinematic_tree_is_complete(self):
        for name in ("robotis_op3","unitree_g1"):
            with self.subTest(robot=name):
                model=load(name)
                positions=model.forward()
                self.assertEqual(len(positions),model.profile["link_count"])
                self.assertIn(model.spec["ankle"],positions)


if __name__=="__main__":
    unittest.main()
