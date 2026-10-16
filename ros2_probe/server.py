"""Read-only HTTP evidence endpoint, executed once on a genuine ROS 2 image.

Exposes only status and synthetic test provenance; NO dialogue or archive input.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

from real_dds_probe import main as probe_main


def report():
    path = Path('/tmp/soulbridge-ros2-report.json')
    if path.is_file():
        return json.loads(path.read_text())
    return {'status': 'REAL_ROS2_DDS_LOOPBACK_UNVERIFIED'}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ('/', '/healthz', '/report'):
            self.send_error(404)
            return
        current = report()
        status = current.get('status')
        body = {
            'project': 'ASTRA SOULBRIDGE OMEGA',
            'status': status,
            'ros2_runtime_pass': status == 'REAL_ROS2_DDS_LOOPBACK_PASS',
            'privacy': 'Public synthetic fixture only; private data rejected.',
        } if self.path == '/' else (
            {'status': status} if self.path == '/healthz' else current)
        raw = (json.dumps(body, ensure_ascii=False, indent=2) + '\n').encode()
        code = 503 if self.path == '/healthz' and status != 'REAL_ROS2_DDS_LOOPBACK_PASS' else 200
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        self.send_error(405, 'Read-only synthetic test endpoint')


def main():
    print('SOULBRIDGE: executing real ROS2 DDS loopback probe', flush=True)
    code = probe_main()
    print('SOULBRIDGE: probe result status=' + str(code), flush=True)
    port = int(os.environ.get('PORT', '10000'))
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()


if __name__ == '__main__':
    main()
