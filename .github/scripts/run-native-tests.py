from __future__ import annotations

import subprocess
import sys
from collections import deque


import os

command = [
    "cargo",
    "test",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--lib",
] + sys.argv[1:]
tail: deque[str] = deque(maxlen=40)

# Diagnostic CI : garder la sortie en clair pour repérer un crash harnais.
if os.environ.get("CI_DIAG_FULL_LOG"):
    tail = deque(maxlen=200)

process = subprocess.Popen(
    command,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    encoding="utf-8",
    errors="replace",
)

assert process.stdout is not None
for line in process.stdout:
    print(line, end="", flush=True)
    tail.append(line)

exit_code = process.wait()
if exit_code:
    details = "".join(tail)
    escaped = (
        details.replace("%", "%25")
        .replace("\r", "%0D")
        .replace("\n", "%0A")
    )
    print(
        f"::error title=Native Rust tests failed::{escaped[-60000:]}",
        flush=True,
    )

sys.exit(exit_code)
