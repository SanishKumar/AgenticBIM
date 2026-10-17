"""Local IFC extraction service. No inference calls or model persistence."""
import logging
import os
from pathlib import Path
import tempfile
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ifc_parser import parse_ifc_file
from models import ModelSnapshot

app = FastAPI(title="Trace · AgenticBIM", version="1.0.0")
app.add_middleware(CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

@app.get("/api/health")
def health():
    return {"status": "ok", "engine": "IfcOpenShell", "version": "1.0"}

@app.post("/api/analyze", response_model=ModelSnapshot)
def analyze_ifc(file: UploadFile = File(...)):
    """Sync endpoint runs in FastAPI's worker pool, not the event loop."""
    if not file.filename or not file.filename.lower().endswith(".ifc"):
        raise HTTPException(400, "Choose an .ifc file.")
    safe_name = file.filename.replace("\\", "/").split("/")[-1]
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
        return parse_ifc_file(str(path), safe_name)
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
