"""Vendor-authentic URDF joint-tree binding for two *different robot models*.

No robot hardware, SDK, motor publishing or physics is activated. The manifests
are curated from pinned official repositories; this validates/manipulates their
kinematic trees only. This is NOT proof of manufacturer SDK compatibility.
"""
from __future__ import annotations
import hashlib
import json
import math
from pathlib import Path

EXPECTED = {
    "robotis_op3": {
        "vendor": "ROBOTIS", "model": "OP3", "motors": 20,
        "source_repo": "ROBOTIS-GIT/ROBOTIS-OP3-Common",
        "source_commit": "6f7d56ccef6f78061925c56c6bd9d134d243f911",
        "knee": "l_knee", "ankle": "l_ank_roll_link",
    },
    "unitree_g1": {
        "vendor": "Unitree", "model": "G1-23DOF", "motors": 23,
        "source_repo": "unitreerobotics/unitree_ros",
        "source_commit": "5994d4faef0a9cadd3287f8de0199a67eeb2a259",
        "knee": "left_knee_joint", "ankle": "left_ankle_roll_link",
    },
}


class ModelValidationError(ValueError):
    pass


def _vector(v, n=3):
    if not isinstance(v, list) or len(v) != n or any(
        isinstance(x, bool) or not isinstance(x, (float, int)) or not math.isfinite(x)
        for x in v
    ):
        raise ModelValidationError("BAD_VECTOR")
    return tuple(float(x) for x in v)


def identity():
    return ((1., 0., 0.), (0., 1., 0.), (0., 0., 1.))


def matmul(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3))
                       for j in range(3)) for i in range(3))


def matvec(a, x):
    return tuple(sum(a[i][j] * x[j] for j in range(3)) for i in range(3))


def rot_rpy(r, p, y):
    cr, sr = math.cos(r), math.sin(r)
    cp, sp = math.cos(p), math.sin(p)
    cy, sy = math.cos(y), math.sin(y)
    return (
        (cy*cp, cy*sp*sr-sy*cr, cy*sp*cr+sy*sr),
        (sy*cp, sy*sp*sr+cy*cr, sy*sp*cr-cy*sr),
        (-sp, cp*sr, cp*cr),
    )


def rot_axis(v, theta):
    norm = math.sqrt(sum(x*x for x in v))
    if norm < 0.99 or norm > 1.01:
        raise ModelValidationError("JOINT_AXIS_NOT_NORMALIZED")
    x,y,z = (u / norm for u in v)
    c,s = math.cos(theta),math.sin(theta)
    k = 1.0 - c
    return ((c+x*x*k, x*y*k-z*s, x*z*k+y*s),
            (y*x*k+z*s, c+y*y*k, y*z*k-x*s),
            (z*x*k-y*s, z*y*k+x*s, c+z*z*k))


class RobotDescription:
    def __init__(self, profile):
        if not isinstance(profile, dict):
            raise ModelValidationError("BAD_PROFILE")
        name = profile.get("profile_id")
        if name not in EXPECTED:
            raise ModelValidationError("UNKNOWN_MANUFACTURER_PROFILE")
        spec = EXPECTED[name]
        source=profile.get("source", {})
        if (profile.get("schema") != "soulbridge.real_model_kinematics.v1"
                or profile.get("vendor") != spec["vendor"]
                or profile.get("model") != spec["model"]
                or source.get("repository") != spec["source_repo"]
                or source.get("commit") != spec["source_commit"]
                or profile.get("motor_control_enabled") is not False
                or profile.get("robot_hardware_verified") is not False):
            raise ModelValidationError("UNVERIFIED_PROFILE_OR_UNSAFE_CAPABILITY")
        joints = profile.get("joints", [])
        if not isinstance(joints, list) or not joints:
            raise ModelValidationError("MISSING_JOINT_TREE")
        root = profile.get("root_link")
        if not isinstance(root, str) or not root:
            raise ModelValidationError("MISSING_ROOT")
        parents, names, edges, all_links = {}, set(), {}, {root}
        actuated = 0
        for j in joints:
            name_j, typ = j.get("name"), j.get("type")
            parent, child = j.get("parent"), j.get("child")
            if (not isinstance(name_j,str) or name_j in names
                    or not isinstance(parent,str) or not isinstance(child,str)
                    or child == root or child in parents
                    or not isinstance(typ,str) or typ not in ("fixed","revolute","prismatic","continuous")):
                raise ModelValidationError("JOINT_TREE_OR_TYPE_INVALID")
            _vector(j.get("origin_xyz"))
            _vector(j.get("origin_rpy"))
            axis = _vector(j.get("axis_xyz"))
            if typ != "fixed":
                if typ not in ("revolute","continuous"):
                    raise ModelValidationError("PRISMATIC_MOTION_NOT_SUPPORTED")
                rot_axis(axis, 0.0)
                actuated += 1
                lo, hi=j.get("lower"),j.get("upper")
                if (typ=="revolute" and (not isinstance(lo,(float,int))
                    or not isinstance(hi,(float,int)) or not math.isfinite(lo)
                    or not math.isfinite(hi) or lo >= hi)):
                    raise ModelValidationError("BAD_JOINT_LIMITS")
            else:
                if any(abs(v)>1e-10 for v in axis):
                    raise ModelValidationError("FIXED_JOINT_WITH_AXIS")
            parents[child] = parent
            edges.setdefault(parent, []).append(j)
            names.add(name_j)
            all_links.add(parent)
            all_links.add(child)
        if actuated != spec["motors"] or len(joints) != profile.get("joint_count"):
            raise ModelValidationError("MODEL_JOINT_COUNT_MISMATCH")
        if len(all_links) != profile.get("link_count"):
            raise ModelValidationError("MODEL_LINK_COUNT_MISMATCH")
        # Validate all links reach the unique root without cycles.
        for link in all_links:
            current, visited = link,set()
            while current != root:
                if current in visited or current not in parents:
                    raise ModelValidationError("DISCONNECTED_OR_CYCLIC_JOINT_TREE")
                visited.add(current)
                current=parents[current]
        self.profile=profile
        self.joints={j["name"]:j for j in joints}
        self._edges=edges
        self.profile_id=name
        self.spec=spec
        self.fingerprint=hashlib.sha256(
            json.dumps(profile,sort_keys=True,separators=(",",":"),
                       ensure_ascii=False).encode("utf-8")).hexdigest()

    @classmethod
    def load(cls, path):
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    def forward(self, selected_joint_values=None):
        """Read-only 3D forward kinematics for all links; no motors or simulation."""
        values=selected_joint_values or {}
        if not isinstance(values, dict) or set(values)-self.joints.keys():
            raise ModelValidationError("UNKNOWN_POSE_JOINT")
        positions={self.profile["root_link"]:(0.,0.,0.)}
        orientations={self.profile["root_link"]:identity()}
        stack=[self.profile["root_link"]]
        while stack:
            parent=stack.pop()
            for j in self._edges.get(parent,[]):
                name=j["name"]
                v=values.get(name,0.)
                if not isinstance(v,(int,float)) or not math.isfinite(v):
                    raise ModelValidationError("INVALID_JOINT_VALUE")
                if j["type"]=="fixed" and v!=0:
                    raise ModelValidationError("FIXED_JOINT_MOVEMENT_REJECTED")
                if j["type"]=="revolute":
                    if v < j["lower"]-1e-8 or v > j["upper"]+1e-8:
                        raise ModelValidationError("JOINT_LIMIT_EXCEEDED")
                parent_R=orientations[parent]
                t=matvec(parent_R,j["origin_xyz"])
                positions[j["child"]]=tuple(positions[parent][i]+t[i] for i in range(3))
                local=rot_rpy(*j["origin_rpy"])
                if j["type"] in ("revolute","continuous"):
                    local=matmul(local,rot_axis(j["axis_xyz"],v))
                orientations[j["child"]]=matmul(parent_R,local)
                stack.append(j["child"])
        return positions


def compare_real_models(model_a, model_b):
    if model_a.profile_id==model_b.profile_id:
        raise ModelValidationError("DISTINCT_MANUFACTURERS_REQUIRED")
    if model_a.profile["vendor"]==model_b.profile["vendor"]:
        raise ModelValidationError("DISTINCT_MANUFACTURERS_REQUIRED")
    rows=[]
    for model in (model_a,model_b):
        ankle=model.spec["ankle"]
        knee=model.spec["knee"]
        before=model.forward()[ankle]
        after=model.forward({knee:0.15})[ankle]
        shift=math.dist(before,after)
        if shift < 0.0001:
            raise ModelValidationError("KINEMATIC_PERTURBATION_NOT_OBSERVED")
        rows.append({
            "profile_id":model.profile_id,
            "source_repository":model.profile["source"]["repository"],
            "source_commit":model.profile["source"]["commit"],
            "actuated_joint_count":model.spec["motors"],
            "joint_tree_sha256":model.fingerprint,
            "knee_joint":knee,
            "end_effector_link":ankle,
            "end_effector_displacement_m":round(shift,7),
            "pose_only":True,
            "physics_simulation":False,
        })
    return {
        "status":"TWO_OFFICIAL_MANUFACTURER_KINEMATIC_PROFILES_PASS",
        "models":rows,
        "same_robot_model":False,
        "physics_engines_tested":0,
        "real_manufacturer_hardware_tested":False,
        "motor_commands_enabled":False,
        "context_transfer_tested_in_this_proof":False,
    }
