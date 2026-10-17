"""Disposable IFC worker. Only this process loads the native geometry kernel."""
import json
import os
from pathlib import Path
import sys
from limits import MAX_RESULT_BYTES


def apply_resource_limits(memory_mb: int, cpu_seconds: int):
    if sys.platform == "linux":
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (memory_mb * 1024**2,) * 2)
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_RESULT_BYTES,) * 2)
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def main():
    source, destination, filename, memory_mb, cpu_seconds = sys.argv[1:]
    result = Path(destination)
    apply_resource_limits(int(memory_mb), int(cpu_seconds))
    try:
        from ifc_parser import parse_ifc_file
        snapshot = parse_ifc_file(source, filename)
        encoded = snapshot.model_dump_json().encode("utf-8")
        if len(encoded) > MAX_RESULT_BYTES:
            raise ValueError("The extracted model exceeds the 64 MB review limit. Export a smaller discipline model.")
        result.write_bytes(encoded)
    except ValueError as exc:
        result.write_text(json.dumps({"error": str(exc)[:500]}), encoding="utf-8")
        return 2
    except Exception:
        result.write_text(json.dumps({"error": "Could not read this IFC. Check the source export and its declared units."}), encoding="utf-8")
        return 2
    return 0


if __name__ == "__main__":
    os.environ["OMP_NUM_THREADS"] = "1"
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    sys.exit(main())
