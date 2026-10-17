"""Exercise limits at the ASGI boundary and against actual disposable workers."""
import asyncio
import sys
import time
import pytest
from import_guard import ImportGuard
from limits import ImportLimits
from parser_process import supervise, ParseTimeout, ClientDisconnected


async def exercise_guard(chunks, *, headers=(), limits=None, app=None, slow=False):
    sent, consumed = [], []
    messages = iter(chunks)

    async def receive():
        if slow:
            await asyncio.sleep(1)
        return next(messages, {"type": "http.disconnect"})

    async def default_app(scope, receive, send):
        while True:
            part = await receive()
            consumed.append(part.get("body", b""))
            if not part.get("more_body"):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def send(message):
        sent.append(message)

    guard = ImportGuard(app or default_app, limits or ImportLimits(request_bytes=10), ["http://localhost:3000"])
    scope = {"type": "http", "path": "/api/analyze", "method": "POST", "headers": headers}
    await guard(scope, receive, send)
    return sent, b"".join(consumed)


@pytest.mark.parametrize("headers", [[], [(b"content-length", b"1")]])
def test_streamed_body_limit_is_enforced_even_without_an_honest_length(headers):
    sent, consumed = asyncio.run(exercise_guard([
        {"type": "http.request", "body": b"123456", "more_body": True},
        {"type": "http.request", "body": b"78901", "more_body": False}], headers=headers))
    assert sent[0]["status"] == 413
    assert consumed == b""  # Multipart application was never invoked.


def test_bounded_body_replays_exact_bytes_and_handles_disconnect():
    sent, consumed = asyncio.run(exercise_guard([
        {"type": "http.request", "body": b"12", "more_body": True},
        {"type": "http.request", "body": b"345", "more_body": False}]))
    assert sent[0]["status"] == 200 and consumed == b"12345"
    sent, consumed = asyncio.run(exercise_guard([{"type": "http.disconnect"}]))
    assert not sent and not consumed


@pytest.mark.parametrize("headers,status", [
    ([(b"content-length", b"11")], 413),
    ([(b"content-length", b"invalid")], 400),
    ([(b"content-length", b"-1")], 400),
    ([(b"content-encoding", b"gzip")], 415),
    ([(b"origin", b"https://unrelated.example")], 403),
])
def test_invalid_envelopes_are_rejected_before_reading(headers, status):
    sent, consumed = asyncio.run(exercise_guard([], headers=headers))
    assert sent[0]["status"] == status and not consumed


def test_slow_upload_gets_a_deadline():
    sent, _ = asyncio.run(exercise_guard([], limits=ImportLimits(upload_seconds=.02), slow=True))
    assert sent[0]["status"] == 408


def test_busy_import_does_not_queue_and_slot_is_released_after_failure():
    async def scenario():
        entered, release = asyncio.Event(), asyncio.Event()

        async def app(scope, receive, send):
            entered.set()
            await release.wait()
            raise RuntimeError("test parser failure")

        guard = ImportGuard(app, ImportLimits(), [])
        scope = {"type": "http", "path": "/api/analyze", "method": "POST", "headers": []}
        sent = []

        async def receive():
            return {"type": "http.request", "body": b"abc", "more_body": False}

        async def send(message):
            sent.append(message)

        task = asyncio.create_task(guard(scope, receive, send))
        await entered.wait()
        await guard(scope, receive, send)
        assert sent[0]["status"] == 503
        assert (b"retry-after", b"5") in sent[0]["headers"]
        release.set()
        with pytest.raises(RuntimeError):
            await task
        assert not guard.slots.locked()

    asyncio.run(scenario())


@pytest.mark.parametrize("stop", ["deadline", "disconnect", "cancellation"])
def test_running_worker_is_killed_and_reaped_on_each_stop_path(tmp_path, stop):
    marker = tmp_path / "should-not-exist"
    script = tmp_path / "slow_worker.py"
    script.write_text("import time, pathlib, sys\ntime.sleep(1)\npathlib.Path(sys.argv[1]).write_text('still running')\n")

    async def scenario():
        start = time.monotonic()

        async def disconnected():
            return stop == "disconnect" and time.monotonic() - start > .1

        task = asyncio.create_task(supervise([sys.executable, str(script), str(marker)],
            timeout=.15 if stop == "deadline" else 5, disconnected=disconnected, cwd=tmp_path))
        if stop == "cancellation":
            await asyncio.sleep(.15)
            task.cancel()
        expected = {"deadline": ParseTimeout, "disconnect": ClientDisconnected, "cancellation": asyncio.CancelledError}[stop]
        with pytest.raises(expected):
            await task
        assert time.monotonic() - start < .9
        await asyncio.sleep(1)
        assert not marker.exists()

    asyncio.run(scenario())


def test_api_maps_timeout_and_cleans_temporary_input(monkeypatch):
    from fastapi.testclient import TestClient
    import main
    paths = []

    async def timeout(path, *args):
        paths.append(path)
        assert path.exists()
        raise ParseTimeout

    monkeypatch.setattr(main, "parse_in_process", timeout)
    with TestClient(main.app) as client:
        response = client.post("/api/analyze", files={"file": ("model.ifc", b"sample")})
        assert response.status_code == 504
        assert client.get("/api/health").status_code == 200
    assert paths and all(not path.exists() for path in paths)


def test_crashed_worker_is_reported_without_losing_the_api_process(tmp_path, monkeypatch):
    import parser_process
    (tmp_path / "parser_worker.py").write_text("import os\nos._exit(23)\n")
    monkeypatch.setattr(parser_process, "__file__", str(tmp_path / "parser_process.py"))
    source = tmp_path / "model.ifc"
    source.write_bytes(b"test")

    async def connected():
        return False

    with pytest.raises(parser_process.ParseStopped):
        asyncio.run(parser_process.parse_in_process(source, "model.ifc", ImportLimits(), connected))
