#!/usr/bin/env python3
"""
BlueChain launcher.

Double-click start.bat (Windows) or run ./start.sh (macOS / Linux), or:

    python run.py

First run creates a private Python environment and installs the dependencies
(1-3 minutes, needs internet). Every run after that starts in a few seconds.
"""
from __future__ import annotations

import os
import pathlib
import socket
import subprocess
import sys
import threading
import time
import venv
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
VENV = BACKEND / ".venv"
MARKER = VENV / ".bluechain-deps"
DIST = ROOT / "frontend" / "dist" / "index.html"


def say(msg: str = "") -> None:
    print(msg, flush=True)


def venv_python() -> pathlib.Path:
    if os.name == "nt":
        return VENV / "Scripts" / "python.exe"
    return VENV / "bin" / "python"


def ensure_venv() -> pathlib.Path:
    if os.environ.get("BLUECHAIN_NO_VENV") == "1":
        return pathlib.Path(sys.executable)
    py = venv_python()
    if not py.exists():
        say("First run: creating a private Python environment (~30 seconds)…")
        venv.EnvBuilder(with_pip=True, clear=False).create(VENV)
    return py


def ensure_deps(py: pathlib.Path) -> None:
    if MARKER.exists():
        return
    say("Installing backend dependencies — one time only, 1 to 3 minutes.")
    say("(You can leave this window open; it prints a lot, that is normal.)")
    cmd = [str(py), "-m", "pip", "install", "--disable-pip-version-check",
           "--prefer-binary", "--no-input", "-r", str(BACKEND / "requirements.txt")]
    # some machines export PIP_USER, which is invalid inside a virtual environment
    pip_env = os.environ.copy()
    pip_env["PIP_USER"] = "0"
    pip_env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
    result = subprocess.call(cmd, env=pip_env)
    if result != 0:
        say("")
        say("Dependency installation failed. Check your internet connection and try again.")
        raise SystemExit(result)
    MARKER.write_text("ok\n", encoding="utf-8")
    say("Dependencies ready.")


def free_port(start: int = 8000) -> int:
    for port in range(start, start + 40):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


def open_when_ready(url: str) -> None:
    if os.environ.get("BLUECHAIN_NO_BROWSER") == "1":
        return

    def worker() -> None:
        import urllib.request

        for _ in range(90):
            time.sleep(1)
            try:
                urllib.request.urlopen(url + "/api/health", timeout=1)
            except Exception:
                continue
            try:
                webbrowser.open(url)
            except Exception:
                pass
            return

    threading.Thread(target=worker, daemon=True).start()


def main() -> int:
    say("=" * 62)
    say("  BlueChain — digital MRV for blue carbon assets")
    say("=" * 62)

    if sys.version_info < (3, 10):
        say(f"Python {sys.version_info.major}.{sys.version_info.minor} found.")
        say("Please install Python 3.12 from https://www.python.org/downloads/")
        return 1

    if not DIST.exists():
        say("Note: frontend/dist is missing, so only the API will be served.")

    py = ensure_venv()
    ensure_deps(py)

    port = free_port()
    url = f"http://127.0.0.1:{port}"

    say("")
    say(f"  Open:      {url}")
    say("  Login:     pawan@bluechain.dev   /  BlueChain@123   (developer)")
    say("             verifier@bluechain.dev /  BlueChain@123   (verifier)")
    say("  API docs:  " + url + "/docs")
    say("")
    say("  Press Ctrl+C in this window to stop the server.")
    say("")

    open_when_ready(url)

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    cmd = [str(py), "-m", "uvicorn", "app.main:app",
           "--host", "127.0.0.1", "--port", str(port), "--log-level", "info"]

    server = subprocess.Popen(cmd, cwd=str(BACKEND), env=env)
    try:
        return server.wait()
    except KeyboardInterrupt:
        say("\nStopping…")
        return 0
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
