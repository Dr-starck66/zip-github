"""Reproducible offline two-virtual-endpoint demo. No motors, LLM or ROS needed."""
import argparse
import json
from pathlib import Path

from .robot_adapters import (RobotIdentity, SyntheticMemory,
                             Transport, default_registry, verify_shared_capsule)


def main(argv=None):
    parser = argparse.ArgumentParser(description="ASTRA SOULBRIDGE Ω synthetic adapter demo")
    parser.add_argument("--capsule", required=True)
    parser.add_argument("--question", default="Quel projet parle de Chicago ?")
    args = parser.parse_args(argv)
    memory = SyntheticMemory.from_file(Path(args.capsule))
    factory = default_registry()
    left = factory.build(RobotIdentity("robotis_op2", "Robotis", "OP2", Transport.SIMULATION), memory)
    right = factory.build(RobotIdentity("softbank_nao", "SoftBank", "NAO", Transport.SIMULATION), memory)
    try:
        print(json.dumps(verify_shared_capsule(left, right, args.question), ensure_ascii=False, indent=2))
    finally:
        left.close()
        right.close()


if __name__ == "__main__":
    main()
