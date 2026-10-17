"""Bound the body before the multipart parser can allocate temporary files."""
import asyncio
import tempfile
from starlette.responses import JSONResponse
from limits import ImportLimits


class ImportGuard:
    def __init__(self, app, limits: ImportLimits, origins: list[str]):
        self.app = app
        self.limits = limits
        self.origins = set(origins)
        self.slots = asyncio.Semaphore(limits.concurrent)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] != "/api/analyze" or scope["method"] != "POST":
            return await self.app(scope, receive, send)

        async def reject(status, detail, headers=None):
            await JSONResponse({"detail": detail}, status_code=status, headers=headers)(scope, receive, send)

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        origin = headers.get(b"origin", b"").decode("latin-1")
        if origin and origin not in self.origins:
            return await reject(403, "This browser origin is not allowed to import models.")
        if headers.get(b"content-encoding", b"identity").lower() != b"identity":
            return await reject(415, "Compressed request bodies are not supported.")
        if b"content-length" in headers:
            try:
                length = int(headers[b"content-length"])
                if length < 0:
                    raise ValueError
            except ValueError:
                return await reject(400, "Invalid Content-Length.")
            if length > self.limits.request_bytes:
                return await reject(413, "Request exceeds the 26 MB multipart limit; the IFC file limit is 25 MB.")
        # No unbounded waiting queue. A slot covers upload, parsing and response.
        if self.slots.locked():
            return await reject(503, "Another model is being imported. Wait for it to finish, then retry.", {"Retry-After": "5"})
        await self.slots.acquire()
        try:
            with tempfile.SpooledTemporaryFile(max_size=1024 * 1024) as body:
                size = 0
                try:
                    async with asyncio.timeout(self.limits.upload_seconds):
                        while True:
                            message = await receive()
                            if message["type"] == "http.disconnect":
                                return
                            chunk = message.get("body", b"")
                            size += len(chunk)
                            if size > self.limits.request_bytes:
                                return await reject(413, "Request exceeds the 26 MB multipart limit; the IFC file limit is 25 MB.")
                            await asyncio.to_thread(body.write, chunk)
                            if not message.get("more_body", False):
                                break
                except TimeoutError:
                    return await reject(408, "Upload took too long. Retry on a stable connection.")
                body.seek(0)
                remaining = size

                async def bounded_receive():
                    nonlocal remaining
                    if remaining:
                        chunk = await asyncio.to_thread(body.read, min(remaining, 64 * 1024))
                        remaining -= len(chunk)
                        return {"type": "http.request", "body": chunk, "more_body": remaining > 0}
                    if size == 0:
                        return {"type": "http.request", "body": b"", "more_body": False}
                    # After multipart consumption, preserve disconnect notification.
                    return await receive()

                await self.app(scope, bounded_receive, send)
        finally:
            self.slots.release()
