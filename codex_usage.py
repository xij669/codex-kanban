"""Read-only Codex app-server quota adapter. No tokens or raw RPC output leave this module."""
import json
import math
import os
import selectors
import shutil
import subprocess
import threading
import time
from pathlib import Path


def normalize_limits(result):
    """Prefer the core Codex bucket; never mistake a model-specific bucket for it."""
    if not isinstance(result, dict):
        return []
    buckets = result.get("rateLimitsByLimitId")
    if isinstance(buckets, dict) and buckets:
        limits = buckets.get("codex")
    else:
        limits = result.get("rateLimits")
        if isinstance(limits, dict) and limits.get("limitId") not in (None, "codex"):
            limits = None
    windows = []
    if not isinstance(limits, dict):
        return windows
    for slot in ("primary", "secondary"):
        window = limits.get(slot)
        if not isinstance(window, dict):
            continue
        used, minutes, resets = (window.get(k) for k in ("usedPercent", "windowDurationMins", "resetsAt"))
        number = lambda x: type(x) in (int, float) and math.isfinite(x)
        if not number(used) or not number(minutes) or minutes <= 0:
            continue
        windows.append({"minutes": minutes, "remainingPercent": round(max(0, min(100, 100 - used)), 1),
                        "resetsAt": resets if number(resets) and 0 < resets < 8640000000000 else None})
    return sorted(windows, key=lambda w: w["minutes"])


def read_limits(command=None, timeout=15):
    """Initialize stdio RPC, read limits, then terminate. Never starts an inference turn."""
    binary = shutil.which("codex") if command is None else None
    if command is None and not binary:
        return {"status": "unavailable", "reason": "cli_missing", "windows": []}
    process = None
    try:
        process = subprocess.Popen(command or [binary, "app-server", "--listen", "stdio://"],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   start_new_session=True)
        deadline, buffer = time.monotonic() + timeout, b""
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)

            def send(message):
                process.stdin.write((json.dumps(message) + "\n").encode())
                process.stdin.flush()

            def response(request_id):
                nonlocal buffer
                while True:
                    while b"\n" in buffer:
                        line, buffer = buffer.split(b"\n", 1)
                        message = json.loads(line)
                        if message.get("id") == request_id:
                            if "error" in message:
                                raise ValueError("RPC unavailable")
                            return message["result"]
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not selector.select(remaining):
                        raise TimeoutError()
                    data = os.read(process.stdout.fileno(), 65536)
                    if not data:
                        raise ValueError("RPC closed")
                    buffer += data
                    if len(buffer) > 1024 * 1024:
                        raise ValueError("RPC response too large")

            send({"id": 1, "method": "initialize", "params": {"clientInfo": {
                "name": "codex_kanban_usage", "title": "Codex Kanban",
                "version": Path(__file__).with_name("VERSION").read_text().strip()}}})
            response(1)
            send({"method": "initialized", "params": {}})
            send({"id": 2, "method": "account/rateLimits/read"})
            windows = normalize_limits(response(2))
            return {"status": "available" if windows else "unavailable", "windows": windows,
                    "checkedAt": int(time.time())}
    except (OSError, ValueError, KeyError, TypeError, TimeoutError):
        # Raw errors can contain account details; expose only a fixed status.
        return {"status": "unavailable", "windows": []}
    finally:
        if process is not None:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            for stream in (process.stdin, process.stdout):
                stream.close()


class UsageCache:
    """Single-flight, one-minute memory cache shared by all browser tabs and projects."""
    def __init__(self, reader=read_limits, ttl=60, clock=time.monotonic):
        self.reader, self.ttl, self.clock = reader, ttl, clock
        self.lock = threading.Lock()
        self.value, self.expires = None, 0

    def get(self):
        with self.lock:
            if self.value is None or self.clock() >= self.expires:
                self.value = self.reader()
                self.expires = self.clock() + self.ttl
            return self.value
