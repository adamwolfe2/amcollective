"""Minimal health-check HTTP server for Fly.io.
Runs as a background daemon alongside `hermes gateway start`.
Fly probes /health — returns 200 OK as long as the process is alive.
"""
import http.server
import os


class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"OK\n")

    def log_message(self, *_):
        pass  # silence access logs


if __name__ == "__main__":
    port = int(os.getenv("HEALTH_PORT", "8080"))
    server = http.server.HTTPServer(("0.0.0.0", port), HealthHandler)
    server.serve_forever()
