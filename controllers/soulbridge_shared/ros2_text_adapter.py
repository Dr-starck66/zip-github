"""Optional ROS 2 *text-only* adapter for synthetic SoulBridge demonstration.

No motor/cmd_vel/trajectory/action topics. Topic consumers must treat text as
untrusted; ROS_DOMAIN_ID and DDS discovery ranges are isolation, NOT encryption.
Runtime cannot start without explicit permission, ROS 2 packages, and a
LOCALHOST discovery configuration (unless separately opted into LAN use).
"""
from __future__ import annotations

import os
from .robot_adapters import AdapterError, RobotIdentity, RobotTextAdapter, SyntheticMemory, Transport


class Ros2TextAdapter(RobotTextAdapter):
    def __init__(self, identity: RobotIdentity, memory: SyntheticMemory):
        if identity.transport != Transport.ROS2_TEXT:
            raise AdapterError("ROS2_TEXT_TRANSPORT_REQUIRED")
        super().__init__(identity, memory)
        self._node = None
        self._rclpy = None
        self._publisher = None
        self._owns_context = False
        self._message_class = None
        self.last_error: str | None = None

    @property
    def inbound_topic(self) -> str:
        return f"/soulbridge/{self.identity.robot_id}/operator_text"

    @property
    def outbound_topic(self) -> str:
        return f"/soulbridge/{self.identity.robot_id}/assistant_text"

    def start(self, *, consent: bool = False, allow_lan: bool = False) -> None:
        if self._node is not None:
            raise AdapterError("ROS2_ALREADY_STARTED")
        if not consent:
            raise AdapterError("EXPLICIT_ROS2_START_CONSENT_REQUIRED")
        domain = os.environ.get("ROS_DOMAIN_ID")
        if not domain or not domain.isdecimal() or not 0 <= int(domain) <= 101:
            raise AdapterError("ROS_DOMAIN_ID_REQUIRED_0_TO_101")
        discovery = os.environ.get("ROS_AUTOMATIC_DISCOVERY_RANGE", "")
        if discovery != "LOCALHOST" and not allow_lan:
            raise AdapterError("ROS_DISCOVERY_MUST_BE_LOCALHOST")
        try:
            import rclpy
            from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy
            from std_msgs.msg import String
        except ImportError as e:
            raise AdapterError("ROS2_RUNTIME_NOT_INSTALLED") from e
        self._rclpy = rclpy
        try:
            if not rclpy.ok():
                rclpy.init(args=None)
                self._owns_context = True
            node = rclpy.create_node("soulbridge_" + self.identity.robot_id)
            self._node = node
            qos = QoSProfile(depth=10, reliability=ReliabilityPolicy.RELIABLE,
                             durability=DurabilityPolicy.VOLATILE)
            self._message_class = String
            self._publisher = node.create_publisher(String, self.outbound_topic, qos)
            node.create_subscription(String, self.inbound_topic, self._on_question, qos)
        except Exception:
            self.close()
            raise AdapterError("ROS2_INITIALIZATION_FAILED") from None

    def _on_question(self, message) -> None:
        if self._node is None or self._publisher is None:
            return
        try:
            result = self.answer(message.data)
            text = result.answer
            outbound = self._message_class()
            outbound.data = text
            self._publisher.publish(outbound)
            self.last_error = None
        except (AdapterError, TypeError, AttributeError):
            # Invalid ROS messages are dropped; do not echo user content.
            self.last_error = "ROS2_QUESTION_REJECTED"

    def spin_once(self, *, timeout_sec: float = 0.1):
        if self._node is None:
            raise AdapterError("ROS2_NOT_STARTED")
        if not 0 <= timeout_sec <= 1:
            raise AdapterError("ROS2_SPIN_TIMEOUT_LIMIT")
        self._rclpy.spin_once(self._node, timeout_sec=timeout_sec)

    def close(self) -> None:
        node = self._node
        self._node = None
        self._publisher = None
        if node is not None:
            node.destroy_node()
        if self._owns_context and self._rclpy is not None:
            self._rclpy.shutdown()
        self._owns_context = False


def register_ros2_text(registry):
    """Opt-in transport registration only; does not initialize DDS or ROS."""
    registry.register(Transport.ROS2_TEXT, Ros2TextAdapter)
    return registry
