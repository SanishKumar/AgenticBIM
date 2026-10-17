"""Local IFC extraction service. No inference calls or model persistence."""
import logging
import os
from pathlib import Path
import tempfile
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from import_guard import ImportGuard
from limits import ImportLimits, MAX_UPLOAD_BYTES
from parser_process import parse_in_process, ParseTimeout, ParseStopped, ClientDisconnected
from models import ModelSnapshot

limits = ImportLimits.from_environment()
origins = [origin.strip() for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()]
app = FastAPI(title="Trace · AgenticBIM", version="1.0.0")
app.add_middleware(ImportGuard, limits=limits, origins=origins)
app.add_middleware(CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

@app.get("/api/health")
def health():
    return {"status": "ok", "engine": "IfcOpenShell", "version": "1.0",
        "imports": {"concurrent": limits.concurrent, "timeout_seconds": limits.parse_seconds,
            "max_file_bytes": MAX_UPLOAD_BYTES, "isolated_process": True}}

@app.post("/api/analyze", response_model=ModelSnapshot)
async def analyze_ifc(request: Request, file: UploadFile = File(...)):
    """The web process never parses IFC or loads the native geometry kernel."""
    if not file.filename or not file.filename.lower().endswith(".ifc"):
        raise HTTPException(400, "Choose an .ifc file.")
    safe_name = file.filename.replace("\\", "/").split("/")[-1][:255]
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as target:
            path = Path(target.name)
            total = 0
            while chunk := file.file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "File exceeds the 25 MB local-review limit.")
                target.write(chunk)
        if total == 0:
            raise HTTPException(422, "The file is empty.")
        return await parse_in_process(path, safe_name, limits, request.is_disconnected)
    except ParseTimeout:
        raise HTTPException(504, f"IFC parsing exceeded {limits.parse_seconds:g} seconds and was stopped. Export a smaller discipline model.")
    except ParseStopped:
        raise HTTPException(422, "The IFC parser stopped before finishing, possibly at a resource limit. Export a smaller model or check the source file.")
    except ClientDisconnected:
        raise HTTPException(499, "Import cancelled; parser stopped.")
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        logging.exception("IFC extraction failed")
        raise HTTPException(422, "Could not read this IFC. Check that it is a valid IFC STEP export with declared project units.") from exc
    finally:
        file.file.close()
        if path:
            path.unlink(missing_ok=True)
