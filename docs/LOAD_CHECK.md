# Parser load check · 17 October 2026

This checks the advertised element boundary using rectangular columns with unique placements and occurrence-level quantities. The source representation is shared, as it often is for repeated components. It exercises the isolated worker, geometry extraction, serialization and parent-side validation. Fixture generation and browser rendering are excluded from the timing.

| Elements | Meshes retained | Triangles | IFC size | Result size | Median of 3 runs |
| --- | --- | --- | --- | --- | --- |
| 1,000 | 1,000 | 12,000 | 421,149 bytes | 707,093 bytes | 1.333 s |
| 5,000 | 5,000 | 60,000 | 2,167,266 bytes | 3,571,041 bytes | 4.821 s |

Every element retained its expected 0.512 m³ declared volume. Runs used Python 3.12.14 and IfcOpenShell 0.9.0 on one Windows 11 development machine, with the default 60-second parser deadline. Linux resource limits do not apply to the Windows measurement. [Raw measurements and scope](parser-load-check.json) include all repetitions.

Reproduce from the repository root:

```powershell
.venv\Scripts\python scripts/benchmark.py --output parser-load-check.json
```

Use `.venv/bin/python` on macOS/Linux. Temporary IFCs and worker outputs are removed when the check finishes. The script asserts element counts, meshes and quantities; it fails rather than reporting a successful partial extraction.

This is a small, repeatable capacity check. It is not a customer-model benchmark, a memory profile, a GPU/frame-rate measurement or evidence that arbitrary 5,000-element models will finish within the deadline. Complex geometry, openings, authoring-tool exports and models near the triangle budget need separate measurements.
