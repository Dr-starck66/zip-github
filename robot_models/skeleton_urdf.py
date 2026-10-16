"""Safe minimal URDF skeleton generated from pinned manufacturer descriptions.

This intentionally omits meshes, dynamic inertias, plugins, transmissions and
motor controllers. It describes genuine vendor-specific joint topology only,
for ROS2 robot_state_publisher or visualization. NOT physical hardware control.
"""
from __future__ import annotations
import math
import xml.etree.ElementTree as ET

from robot_models.kinematics import RobotDescription, ModelValidationError

def _nums(v):
    return " ".join(format(float(x), ".12g") for x in v)

def export_skeleton_urdf(model:RobotDescription) -> str:
    if not isinstance(model, RobotDescription):
        raise ModelValidationError("VALIDATED_DESCRIPTION_REQUIRED")
    root=ET.Element("robot", {"name":model.profile_id+"_kinematic_skeleton"})
    links={model.profile["root_link"]}
    for joint in model.profile["joints"]:
        links.add(joint["parent"])
        links.add(joint["child"])
    for link in sorted(links):
        ET.SubElement(root, "link", {"name":link})
    for j in model.profile["joints"]:
        node=ET.SubElement(root,"joint",{"name":j["name"],"type":j["type"]})
        ET.SubElement(node,"parent",{"link":j["parent"]})
        ET.SubElement(node,"child",{"link":j["child"]})
        ET.SubElement(node,"origin",{"xyz":_nums(j["origin_xyz"]),
                                     "rpy":_nums(j["origin_rpy"])})
        if j["type"] != "fixed":
            ET.SubElement(node,"axis",{"xyz":_nums(j["axis_xyz"])})
            if j["type"]=="revolute":
                ET.SubElement(node,"limit",
                              {"effort":"0","velocity":"0",
                               "lower":format(j["lower"],".12g"),
                               "upper":format(j["upper"],".12g")})
            elif j["type"]=="continuous":
                ET.SubElement(node,"limit",{"effort":"0","velocity":"0"})
    out=ET.tostring(root,encoding="unicode")
    if ("<transmission" in out or "<gazebo" in out or "<plugin" in out
            or "mesh filename" in out or "motor" in out):
        raise ModelValidationError("UNSAFE_MOTION_OR_MESH_SKELETON")
    parsed=ET.fromstring(out)
    if len(parsed.findall("joint"))!=model.profile["joint_count"]:
        raise ModelValidationError("MISSING_GENERATED_JOINTS")
    return '<?xml version="1.0" encoding="UTF-8"?>\n'+out+'\n'

def joint_state_snapshot(model:RobotDescription, q=None) -> dict:
    """Static read-only ROS2 JointState payload; no controller or motor calls."""
    if not isinstance(model,RobotDescription):
        raise ModelValidationError("VALIDATED_DESCRIPTION_REQUIRED")
    model.forward(q or {})
    moving=[j for j in model.profile["joints"] if j["type"]!="fixed"]
    values=q or {}
    return {
        "name":[j["name"] for j in moving],
        "position":[values.get(j["name"],0.0) for j in moving],
        "velocity":[0.0]*len(moving),
        "effort":[0.0]*len(moving),
        "meaning":"kinematic visualization only; no physical joint feedback",
    }
