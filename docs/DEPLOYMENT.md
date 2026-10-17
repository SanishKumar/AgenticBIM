# Running the packaged app

The Compose stack runs the production frontend, IFC service and an Nginx gateway. It publishes only `127.0.0.1:3000`; it does not create a public service or a shared review database.

## Start

Install Docker Engine or Docker Desktop with Compose v2, then run from the repository root:

```sh
docker compose up --build -d --wait
```

Open [localhost:3000](http://localhost:3000). The example and real IFC imports both work from that address. For another local port, set `TRACE_PORT` before starting Compose; the API's allowed browser origins follow that port.

```powershell
$env:TRACE_PORT = "3001"
docker compose up --build -d --wait
```

Stop with `docker compose down`. Rebuild after pulling code changes. The frontend image uses Next's standalone output; local `.env` files and dependency directories are excluded from the build context.

## Verify

```sh
python scripts/smoke.py http://127.0.0.1:3000
docker compose ps
```

The smoke check loads the page, checks API health, imports the included IFC padded with whitespace to exceed 11 MB, verifies all 135 source meshes and the intentionally unknown volume, and checks that a 28 MB request envelope is rejected. It does not modify a browser's stored review. GitHub Actions builds the images and runs this check on Ubuntu, then separately sends the same large import through Next's rewrite using `scripts/proxy-smoke.mjs`.

The Next.js development/standalone proxy is explicitly configured for a 26 MiB body and a 160-second upstream timeout. Its default 10 MiB buffer would otherwise truncate a supported upload. The container gateway forwards imports directly to the API and enforces its own envelope limit.

## Import budgets

An import occupies one slot from the start of the upload until the response completes. Excess imports receive `503` with `Retry-After`; they do not accumulate in an in-memory queue. Other API endpoints remain available.

| Boundary | Default | Enforcement |
| --- | --- | --- |
| IFC file | 25 MiB | File handler |
| Multipart request | 26 MiB | Gateway and ASGI body reader, including chunked bodies |
| Upload duration | 30 seconds | ASGI body reader |
| Active imports | 1 per API process | Admission before multipart parsing |
| Parser elapsed time | 60 seconds | Parent supervisor kills and reaps worker |
| Worker CPU time | 45 seconds | Linux `RLIMIT_CPU` |
| Worker address space | 2 GiB | Linux `RLIMIT_AS` |
| Result size | 64 MiB | Worker serialization, Linux file limit and parent validation |
| Physical elements / preview triangles | 5,000 / 750,000 | IFC extractor |

The worker is also terminated when the request disconnects or its server task is cancelled. Source, body-spool and result files are removed after use. The worker receives a small OS-runtime environment rather than inheriting unrelated application credentials. The API process does not import the geometry kernel.

`TRACE_IMPORT_CONCURRENCY`, `TRACE_UPLOAD_SECONDS`, `TRACE_PARSE_SECONDS`, `TRACE_WORKER_MEMORY_MB` and `TRACE_WORKER_CPU_SECONDS` configure the service budgets. Use a single Uvicorn worker: admission limits are per API process. Raising concurrency also requires accounting for memory and temporary storage for every active worker.

Elapsed-time supervision works on Windows and Linux. CPU, address-space and output-file OS limits are Linux-specific. Process separation is not an operating-system security sandbox. The container adds non-root users, read-only filesystems, temporary-storage limits, dropped capabilities, no-new-privileges, process limits and CPU/memory caps. The gateway applies an import request rate limit and prevents an oversized body from reaching Next.js.

## Public hosting remains a separate step

Do not change the loopback binding and treat that as a finished public deployment. A public installation needs an authenticated gateway, TLS, per-user quotas, model-access policy, operational monitoring and a chosen retention policy. This repository has no user accounts or shared server-side review storage. Browser notes remain on that browser/device, even when the app is run in containers.

Base images follow their named release tags. Runtime application dependencies are pinned; a fully immutable deployment should also record verified image digests for its target platform. The current development-only ESLint dependency chain has an [unpatched braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Those lint dependencies are not copied into the standalone runtime image; CI checks production dependency advisories separately.

References: [Python subprocess supervision](https://docs.python.org/3/library/subprocess.html), [Linux resource limits](https://docs.python.org/3/library/resource.html), [Compose service limits](https://docs.docker.com/reference/compose-file/services/).
