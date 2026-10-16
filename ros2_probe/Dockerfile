# ROS 2 Jazzy on Ubuntu Noble 24.04; official maintained ROS image.
# No robot drivers, no cameras, no motors, no ChatGPT exports or secrets.
FROM ros:jazzy-ros-base
ENV ROS_DOMAIN_ID=42 \
    ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST \
    ROS_STATIC_PEERS= \
    PYTHONUNBUFFERED=1 \
    ROS_LOG_DIR=/tmp/soulbridge_ros_logs
RUN apt-get update \
  && apt-get install --no-install-recommends -y ros-jazzy-std-msgs \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY controllers/soulbridge_shared/ controllers/soulbridge_shared/
COPY data/synthetic_capsule.json data/synthetic_capsule.json
COPY ros2_probe/ ros2_probe/
RUN useradd -u 10001 --create-home soulbridge \
 && mkdir -p /tmp/soulbridge_ros_logs \
 && chown -R soulbridge:soulbridge /tmp/soulbridge_ros_logs /app
USER soulbridge
EXPOSE 10000
CMD ["/bin/bash", "-lc", "source /opt/ros/jazzy/setup.bash && exec python3 -u ros2_probe/server.py"]
