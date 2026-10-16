"""Vendor-neutral conversation transport. Strictly no robot motion/actuation API.

Current proof boundary: only a *public synthetic fixture* can be passed in. A real
ChatGPT export is deliberately unsupported and must never enter a public ROS graph.
These classes are transport interfaces, NOT certified robot driver integrations.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
import hashlib
import re
from pathlib import Path
from typing import Callable

from .memory_engine import load_capsule, retrieve

_IDENTIFIER = re.compile(r"[a-z][a-z0-9_]{1,31}\Z", re.ASCII)
MAX_QUESTION = 500
MAX_ANSWER = 600


class AdapterError(ValueError):
    """Fail-closed adapter error, with no private data in the error string."""


class Transport(str, Enum):
    SIMULATION = "simulation"
    ROS2_TEXT = "ros2_text"


@dataclass(frozen=True)
class RobotIdentity:
    robot_id: str
    manufacturer: str
    model: str
    transport: Transport = Transport.SIMULATION

    def __post_init__(self):
        if not _IDENTIFIER.fullmatch(self.robot_id):
            raise AdapterError("INVALID_ROBOT_ID")
        if not isinstance(self.manufacturer, str) or not 1 <= len(self.manufacturer) <= 64:
            raise AdapterError("INVALID_MANUFACTURER")
        if not isinstance(self.model, str) or not 1 <= len(self.model) <= 64:
            raise AdapterError("INVALID_ROBOT_MODEL")
        if not isinstance(self.transport, Transport):
            raise AdapterError("INVALID_TRANSPORT")


@dataclass(frozen=True)
class DialogueResult:
    robot_id: str
    capsule_sha256: str
    answer: str
    memory_found: bool
    source: str | None
    proof_level: str = "SYNTHETIC_DETERMINISTIC_ONLY"


class SyntheticMemory:
    """An immutable-for-consumers, synthetic-only source shared across transports.

    No actual user history, API calls, voice, motors, or cloud service is permitted.
    """

    def __init__(self, capsule: dict, sha256: str):
        if (not isinstance(capsule, dict) or capsule.get("schema") != "soulbridge.capsule.v1"
                or capsule.get("processing", {}).get("source") != "synthetic_fixture"):
            raise AdapterError("PRIVATE_OR_INVALID_CAPSULE_REJECTED")
        if not re.fullmatch(r"[a-f0-9]{64}", sha256):
            raise AdapterError("INVALID_CAPSULE_HASH")
        self._capsule = capsule
        self.sha256 = sha256

    @classmethod
    def from_file(cls, path: str | Path) -> "SyntheticMemory":
        cap, digest = load_capsule(path)  # handles synthetic-only gate and size limit
        return cls(cap, digest)

    def recall(self, question: str) -> tuple[bool, str | None, str]:
        if not isinstance(question, str) or not 1 <= len(question.strip()) <= MAX_QUESTION:
            raise AdapterError("INVALID_QUESTION")
        item = retrieve(self._capsule, question.strip())
        # Never return unrestricted generated text or robot tool commands.
        return bool(item["found"]), item["source"], item["reply"][:MAX_ANSWER]


class RobotTextAdapter(ABC):
    """Only text-level dialogue. In particular NO movement, camera or microphone."""

    def __init__(self, identity: RobotIdentity, memory: SyntheticMemory):
        if not isinstance(memory, SyntheticMemory):
            raise AdapterError("SYNTHETIC_MEMORY_REQUIRED")
        self.identity = identity
        self.memory = memory

    @property
    def capabilities(self) -> tuple[str, ...]:
        return ("text_input", "text_output", "synthetic_memory", "no_actuation")

    def answer(self, question: str) -> DialogueResult:
        found, source, answer = self.memory.recall(question)
        return DialogueResult(self.identity.robot_id, self.memory.sha256, answer, found, source)

    @abstractmethod
    def close(self) -> None:
        ...


class SimulationTextAdapter(RobotTextAdapter):
    """Manufacturer-labelled virtual endpoint, NOT an SDK for that manufacturer."""

    def __init__(self, identity: RobotIdentity, memory: SyntheticMemory):
        if identity.transport != Transport.SIMULATION:
            raise AdapterError("SIMULATION_TRANSPORT_REQUIRED")
        super().__init__(identity, memory)
        self._closed = False

    def answer(self, question: str) -> DialogueResult:
        if self._closed:
            raise AdapterError("ADAPTER_CLOSED")
        return super().answer(question)

    def close(self) -> None:
        self._closed = True


class RobotAdapterRegistry:
    """Simple explicit registry; adding a manufacturer requires no core changes."""

    def __init__(self):
        self._factories: dict[Transport, Callable[[RobotIdentity, SyntheticMemory], RobotTextAdapter]] = {}

    def register(self, transport: Transport, factory: Callable[[RobotIdentity, SyntheticMemory], RobotTextAdapter]):
        if not isinstance(transport, Transport) or not callable(factory):
            raise AdapterError("INVALID_FACTORY")
        if transport in self._factories:
            raise AdapterError("DUPLICATE_TRANSPORT")
        self._factories[transport] = factory

    def build(self, identity: RobotIdentity, memory: SyntheticMemory) -> RobotTextAdapter:
        try:
            adapter = self._factories[identity.transport](identity, memory)
        except KeyError as e:
            raise AdapterError("TRANSPORT_NOT_REGISTERED") from e
        if not isinstance(adapter, RobotTextAdapter) or adapter.identity != identity:
            raise AdapterError("INVALID_FACTORY_RESULT")
        return adapter


def default_registry() -> RobotAdapterRegistry:
    registry = RobotAdapterRegistry()
    registry.register(Transport.SIMULATION, SimulationTextAdapter)
    # ROS2 requires an explicit opt-in constructor; it is NOT started by default.
    return registry


def verify_shared_capsule(a: RobotTextAdapter, b: RobotTextAdapter, question: str) -> dict:
    """Compare two adapters without claiming two simulators or real robots."""
    if a.identity.robot_id == b.identity.robot_id:
        raise AdapterError("TWO_DISTINCT_ROBOT_IDS_REQUIRED")
    if a.memory.sha256 != b.memory.sha256:
        raise AdapterError("CAPSULE_MISMATCH")
    left = a.answer(question)
    right = b.answer(question)
    if (left.answer, left.memory_found) != (right.answer, right.memory_found):
        raise AdapterError("DIALOGUE_MISMATCH")
    return {
        "status": "SYNTHETIC_TEXT_ADAPTER_PASS",
        "capsule_sha256": left.capsule_sha256,
        "robot_ids": [left.robot_id, right.robot_id],
        "question_sha256": hashlib.sha256(question.encode("utf-8")).hexdigest(),
        "answer_sha256": hashlib.sha256(left.answer.encode("utf-8")).hexdigest(),
        "memory_found": left.memory_found,
        "provenance": left.proof_level,
        "physical_robots_tested": False,
        "ros2_runtime_tested": False,
        "robot_actuation_enabled": False,
    }
