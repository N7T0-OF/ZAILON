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
# Les erreurs rustc (E0599…) sont imprimées AVANT les warnings : le tail ne
# garde que la fin. On capture aussi les lignes `error[` avec leur contexte
# (lignes suivantes) — l'annotation GitHub est tronquée ~4 Ko par ligne.
error_context: list[str] = []
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
context_remaining = 0
for line in process.stdout:
    print(line, end="", flush=True)
    tail.append(line)
    if "error[" in line or line.startswith("error:"):
        error_context.append(line)
        context_remaining = 25
    elif context_remaining > 0:
        error_context.append(line)
        context_remaining -= 1

exit_code = process.wait()
if exit_code:
    details = "".join(tail)
    escaped = (
        details.replace("%", "%25")
        .replace("\r", "%0D")
        .replace("\n", "%0A")
    )
    print(
        f"::error title=Native Rust tests failed (tail)::{escaped[-60000:]}",
        flush=True,
    )
    if error_context:
        errors_escaped = (
            "".join(error_context).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        )
        print(
            f"::error title=Native Rust tests failed (errors)::{errors_escaped[-60000:]}",
            flush=True,
        )

sys.exit(exit_code)
