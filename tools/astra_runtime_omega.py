#!/usr/bin/env python3
"""ASTRA RUNTIME Ω — provider-neutral ROS2/Qwen proof selector.

The code never calls a hosting provider, installs packages, starts GitHub Actions,
or creates a billable resource. Runtime discovery and execution are separated.
Status PASS is *only* returned after the real probe exits 0 and its evidence JSON
confirms all required proof gates.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / "ros2_probe" / "qwen_handoff_probe.py"
REPORT = Path("/tmp/soulbridge-qwen-ros2-handoff-report.json")
MODEL_HEALTH = "http://127.0.0.1:18080/health"

class GateError(RuntimeError):
    pass

def has_native_ros2():
    return Path("/opt/ros/jazzy/setup.bash").is_file() and shutil.which("bash") is not None

def has_prepared_rootfs():
    name = os.environ.get("ASTRA_ROS_ROOTFS", "")
    if not name or not Path(name).is_absolute():
        return False
    root = Path(name)
    return (root.is_dir()
            and (root / "opt/ros/jazzy/setup.bash").is_file()
            and (root / "app/ros2_probe/qwen_handoff_probe.py").is_file()
            and shutil.which("chroot") is not None
            and getattr(os, "geteuid", lambda: 1)() == 0)

def model_ready():
    try:
        with urllib.request.urlopen(MODEL_HEALTH, timeout=2) as r:
            d = json.loads(r.read(4096))
        return d.get("status") == "ok"
    except (OSError, ValueError, urllib.error.URLError):
        return False

def detect():
    offline_suite = (ROOT / "tests/test_real_manufacturer_kinematics.py").is_file()
    available = []
    if has_native_ros2():
        available.append("native_ros2_jazzy")
    if has_prepared_rootfs():
        available.append("existing_oci_rootfs")
    return {
        "runtime_candidates": available,
        "local_qwen_ready": model_ready(),
        "kinematic_test_suite_present": offline_suite,
        "github_actions_required": False,
        "vendor_cloud_required": False,
        "new_subscription_required": False,
        "remote_robot_sdk_tested": False,
    }

def choose_command(d):
    if not PROBE.is_file():
        raise GateError("ROS2_PROBE_MISSING")
    env = os.environ.copy()
    env["ROS_AUTOMATIC_DISCOVERY_RANGE"] = "LOCALHOST"
    env["ROS_DOMAIN_ID"] = "42"
    if "native_ros2_jazzy" in d["runtime_candidates"]:
        # Fixed trusted command, no interpolation from untrusted input.
        return ["bash", "-lc",
                "source /opt/ros/jazzy/setup.bash && cd " +
                __import__("shlex").quote(str(ROOT)) +
                " && python3 -u ros2_probe/qwen_handoff_probe.py"], env
    if "existing_oci_rootfs" in d["runtime_candidates"]:
        rootfs = os.environ["ASTRA_ROS_ROOTFS"]
        return ["chroot", rootfs, "/bin/bash", "-lc",
                "source /opt/ros/jazzy/setup.bash && cd /app "
                "&& python3 -u ros2_probe/qwen_handoff_probe.py"], env
    raise GateError("REAL_ROS2_RUNTIME_UNAVAILABLE")

def verify_report(report):
    if report.get("status") != "REAL_QWEN_ROS2_CROSS_DOMAIN_HANDOFF_PASS":
        return False
    if not (report.get("real_rclpy_dds") is True
            and report.get("distinct_ros2_dds_domains") is True
            and report.get("negative_cross_domain_dds_discovery_pass") is True
            and report.get("handoff_via_explicit_transcript") is True
            and report.get("synthetic_only") is True
            and report.get("motor_commands_enabled") is False):
        return False
    domains = {report.get("domain_A"), report.get("domain_B")}
    if domains != {42, 43}:
        return False
    turns = report.get("turns")
    if not isinstance(turns, list) or len(turns) != 4 or not all(
            isinstance(t, dict) and t.get("real_generation") is True
            and isinstance(t.get("model_answer"), str) and t["model_answer"]
            for t in turns):
        return False
    # The latest vendor model integration adds strict proof gates.
    return (report.get("both_manufacturer_descriptions_loaded_and_used") is True
            and report.get("two_different_vendor_urdf_skeletons_received_via_ros2_dds") is True
            and report.get("manufacturer_robot_description_files_tested") is True
            and report.get("vendor_joint_state_counts") == [20, 23])

def execute():
    d = detect()
    if not d["kinematic_test_suite_present"]:
        return {"status": "BLOCKED", "code": "VENDOR_KINEMATIC_TESTS_MISSING", **d}
    static = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests",
         "-p", "test_real_manufacturer_kinematics.py", "-v"],
        cwd=ROOT, capture_output=True, text=True, timeout=45)
    if static.returncode:
        return {"status": "FAIL", "code": "KINEMATICS_TEST_FAIL",
                "test_output_tail": (static.stderr or static.stdout)[-1200:], **d}
    if not d["runtime_candidates"]:
        return {"status": "BLOCKED", "code": "NO_LOCAL_ROS2_OR_EXISTING_OCI", **d,
                "kinematics_tests_pass": True}
    if not d["local_qwen_ready"]:
        return {"status": "BLOCKED", "code": "LOCAL_QWEN_NOT_RUNNING", **d,
                "kinematics_tests_pass": True}
    try:
        cmd, env = choose_command(d)
        # Stale PASS reports are never accepted.
        # For prepared chroot, the report lives in the chroot's /tmp.
        path = (REPORT if cmd[0] != "chroot" else
                Path(os.environ["ASTRA_ROS_ROOTFS"]) / REPORT.relative_to("/"))
        path.unlink(missing_ok=True)
        result = subprocess.run(cmd, env=env, cwd=ROOT,
                                capture_output=True, text=True, timeout=240)
        if not path.is_file():
            return {"status": "FAIL", "code": "MISSING_NEW_EXECUTION_REPORT", **d}
        report = json.loads(path.read_text(encoding="utf-8"))
        if result.returncode != 0 or not verify_report(report):
            return {"status": "FAIL", "code": "ROS2_VENDOR_INTEGRATION_NOT_PROVED",
                    "real_probe_status": report.get("status"), **d}
        return {"status": "PASS", "proof": report.get("status"),
                "runtime": d["runtime_candidates"][0],
                "test_time_utc": report.get("timestamp_utc"),
                "kinematics_tests_pass": True,
                "real_qwen_ros2_distinct_vendor_urdf_pass": True,
                "physical_robots_tested": False}
    except (subprocess.TimeoutExpired, GateError, OSError, ValueError) as exc:
        return {"status": "FAIL", "code": type(exc).__name__, **d}

def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--mode", choices=["check","test"], default="check")
    args = p.parse_args(argv)
    if args.mode == "check":
        outcome = {"status": "CHECK_ONLY", **detect()}
    else:
        outcome = execute()
    print(json.dumps(outcome, ensure_ascii=False, indent=2))
    return 1 if outcome["status"] in ("FAIL", "BLOCKED") else 0

if __name__ == "__main__":
    raise SystemExit(main())
