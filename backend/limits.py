"""Resource budgets for one local review service process."""
import os
from dataclasses import dataclass

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024  # Multipart envelope.
MAX_RESULT_BYTES = 64 * 1024 * 1024


def positive_setting(name: str, default: int, maximum: int) -> int:
    value = int(os.getenv(name, str(default)))
    if not 1 <= value <= maximum:
        raise ValueError(f"{name} must be between 1 and {maximum}")
    return value


@dataclass(frozen=True)
class ImportLimits:
    concurrent: int = 1
    upload_seconds: float = 30
    parse_seconds: float = 60
    memory_mb: int = 2048
    cpu_seconds: int = 45
    request_bytes: int = MAX_REQUEST_BYTES

    @classmethod
    def from_environment(cls):
        return cls(
            concurrent=positive_setting("TRACE_IMPORT_CONCURRENCY", 1, 4),
            upload_seconds=positive_setting("TRACE_UPLOAD_SECONDS", 30, 120),
            parse_seconds=positive_setting("TRACE_PARSE_SECONDS", 60, 150),
            memory_mb=positive_setting("TRACE_WORKER_MEMORY_MB", 2048, 4096),
            cpu_seconds=positive_setting("TRACE_WORKER_CPU_SECONDS", 45, 120),
        )
