"""Exercise a deployed stack using only Python's standard library."""
import http.client
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit
from urllib.request import urlopen, Request

base = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:3000"
with urlopen(base + "/", timeout=10) as response:
    assert b"Trace" in response.read()
with urlopen(base + "/api/health", timeout=10) as response:
    assert json.load(response)["imports"]["isolated_process"] is True
source = Path(__file__).resolve().parents[1] / "frontend/public/demo/northbank-r02.ifc"
boundary = "trace-smoke-boundary"
body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="northbank.ifc"\r\n'
        'Content-Type: application/octet-stream\r\n\r\n').encode() + source.read_bytes() + b" " * (11 * 1024**2) + f"\r\n--{boundary}--\r\n".encode()
request = Request(base + "/api/ifc", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
with urlopen(request, timeout=80) as response:
    model = json.load(response)
    assert len(model["elements"]) == 135 and model["source"] == "ifc"
    assert all(element["mesh"] for element in model["elements"])
    assert sum(element["quantities"]["volume"] is None for element in model["elements"]) == 1

# Reject oversized envelopes before clients have to send the payload.
url = urlsplit(base)
connection = http.client.HTTPConnection(url.hostname, url.port, timeout=5)
connection.request("POST", "/api/ifc", body=b"", headers={"Content-Length": str(28 * 1024**2)})
response = connection.getresponse()
assert response.status == 413, response.status
response.read()
connection.close()
print("Stack smoke passed: page, health, IFC import over 11 MB, all source meshes, explicit missing quantity, oversized request rejection.")
