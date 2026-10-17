"""Supervise a fresh process per import, including cancellation and cleanup."""
import asyncio
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from limits import ImportLimits, MAX_RESULT_BYTES
from models import ModelSnapshot


class ParseTimeout(Exception):
    pass


class ParseStopped(Exception):
    pass


class ClientDisconnected(Exception):
    pass


async def supervise(command, *, timeout, disconnected, cwd, env=None):
    # Popen also works with Windows event loops without subprocess transports.
    process = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    deadline = asyncio.get_running_loop().time() + timeout
    try:
        while process.poll() is None:
            if asyncio.get_running_loop().time() >= deadline:
                raise ParseTimeout
            if await disconnected():
                raise ClientDisconnected
            await asyncio.sleep(.05)
        return process.returncode
    finally:
        if process.poll() is None:
            process.kill()
        # Reap before removing its directory, including when the caller cancels.
        await asyncio.to_thread(process.wait)


async def parse_in_process(path: Path, filename: str, limits: ImportLimits, disconnected) -> ModelSnapshot:
    worker = Path(__file__).with_name("parser_worker.py").resolve()
    with tempfile.TemporaryDirectory(prefix="trace-worker-") as directory:
        result = Path(directory) / "result.json"
        command = [sys.executable, "-B", str(worker), str(path.resolve()), str(result),
            filename, str(limits.memory_mb), str(limits.cpu_seconds)]
        # Pass OS runtime settings, not unrelated application secrets.
        env = {key: value for key, value in os.environ.items()
            if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"}}
        env.update(OMP_NUM_THREADS="1", OPENBLAS_NUM_THREADS="1", MKL_NUM_THREADS="1")
        code = await supervise(command, timeout=limits.parse_seconds, disconnected=disconnected, cwd=directory, env=env)
        if not result.exists() or result.stat().st_size > MAX_RESULT_BYTES:
            logging.warning("IFC worker stopped without a bounded result (exit %s)", code)
            raise ParseStopped
        data = result.read_bytes()
        if code == 2:
            raise ValueError(json.loads(data).get("error", "Could not read this IFC."))
        if code != 0:
            logging.warning("IFC worker exited with code %s", code)
            raise ParseStopped
        return ModelSnapshot.model_validate_json(data)
