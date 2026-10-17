# Product review: from generated report to evidence workspace

## Assessment of the starting point

The original product was a file uploader followed by an LLM-generated report. The mathematical extraction was a useful starting idea, but the surrounding claims exceeded what the implementation could establish.

| Finding | Consequence | Resolution |
| --- | --- | --- |
| Empty extraction replaced with `mock_data.json` | A real upload could receive somebody else's building quantities | Empty models return an explicit validation error |
| Only the first five elements sent to the agent | The generated conclusions could not describe the full model | All physical elements enter one deterministic evaluator |
| Every linear value divided by 1,000 | Metre-based exports silently shrank | Read declared project and per-quantity units; preserve conversion evidence |
| `IfcWall` and its subclass queried separately | Standard-case walls could be counted twice | Enumerate physical elements once |
| Missing quantities represented as zero | An incomplete estimate looked cheap and complete | Null quantities, excluded lines, and count-based pricing coverage |
| Composite elements priced from the first material | Entire assemblies could inherit an arbitrary material rate | Explicitly exclude composites until a measured assembly breakdown exists |
| Prices and compliance requirements embedded in prompts | No source, jurisdiction, applicability, or reproducibility | Editable, documented material allowances and clearly scoped project checks |
| Report labelled all volume as concrete | Mixed-material totals misrepresented | Element-specific material mappings and a priced-line ledger |
| Report provenance did not match the configured provider | Implementation and presented provenance diverged | Remove the disconnected narrative generation path |
| Hard-coded API URL and unguarded localStorage | Fragile imports and refresh behavior | Configurable same-origin API proxy and IndexedDB workspace persistence |
| No test suite or dependency manifest for Python | No evidence that quantities or thresholds were correct | Pinned runtime dependencies, regression tests, and CI configuration |

## Product decision

**Trace by AgenticBIM is a pre-estimate evidence desk for a quantity surveyor or BIM coordinator receiving a new IFC export.**

The narrow question is: “What can I responsibly price from this model, what evidence is missing, and what did the next revision change?”

The workflow connects a source element to its declared quantity, raw unit, normalization, exact material rate, finding, reviewer note, and revision delta. The 3D view is navigation into that record. An acknowledgement records a decision; it never changes the source or grants a pass.

The present differentiator is the treatment of uncertainty as part of the workflow: unknown quantities do not become zeros, composite material assignments do not become guesses, and unpriced revision changes do not become zero-dollar deltas. The local demo uses the actual parser and actual IFC files, so a reviewer can reproduce its output without an inference key.

## Competitive reality

This is **not a claim that model checking, 3D BIM viewing, quantity takeoff, or revision comparison is new**.

- [Solibri](https://www.solibri.com/solutions/building-lifecycle/bim-coordination) already covers federated review, model validation, information requirements, and coordination.
- [BIMcollab Zoom](https://helpcenter.bimcollab.com/en/articles/340793-what-added-features-does-bimcollab-zoom-offer-on-top-of-ifc-model-viewing) already extends model viewing with checking and model-data workflows.
- [buildingSMART IDS](https://github.com/buildingSMART/IDS) defines machine-readable information delivery requirements. A bespoke rule engine should not be presented as an invention of that concept or as an IDS implementation.

Trace's product hypothesis is that a small, browser-based evidence handoff can be useful alongside established coordination tools, particularly before an estimate is issued. Researching those products establishes overlap, not demand or a defensible market advantage. Both still need user validation.

## What was built

- Responsive review workspace with real Three.js geometry, orbit, zoom, selection, level filters, review coloring, X-ray, and animated exploded floors.
- Source inspector with IFC entity/quantity paths, original values/units, conversion factors, and net/gross/declared basis.
- Deterministic findings for pricing gaps, material ambiguity, source warnings, and a configurable project door-width target.
- Exact material rate mapping, line-level monetary rounding, excluded-element disclosure, and a CSV quantity schedule.
- GlobalId revision workbench across geometry fingerprints, quantities, material, type, level, and name. A shared-coordinate 3D overlay exposes both versions, including removed elements. Source values, unit conversions and exact allowance calculations sit beside each other. Both revisions use the same rate assumptions.
- Geometry coverage is explicit, with an inspectable queue for unverified pairs. Older or missing fingerprints cannot silently establish that geometry is unchanged. Equivalent vertex/triangle ordering no longer creates a false change.
- The viewer renders on change and while orbit damping or floor movement settles, then stops requesting frames. Background tabs suspend rendering; reduced motion disables floor interpolation and orbit damping.
- Large survey coordinates are recentered in double precision before GPU conversion. Both versions of an element share the same origin, preserving displacement in the comparison overlay.
- Review notes persisted locally. Model/rate changes invalidate their active context. Evidence export includes source fingerprints, assumptions, findings, and current notes.
- Two downloadable synthetic IFC revisions generated from a repeatable script. No live upload silently falls back to them.
- Bounded import admission, upload deadlines and a disposable parser process with cancellation and a server deadline. Linux workers also have CPU, address-space and output-file limits. A Compose stack packages the frontend, API and request-limiting gateway behind a loopback-only port.

## Deliberate limits

- Source QTO values are declarations, not independently measured geometry. The product must never say they are “verified measurements.”
- Default USD rates are illustrative material allowances. This is not a bid, total construction cost, market quote, or professional estimate.
- Overall door width is not a clear opening measurement. The width rule is a project coordination prompt, not a building-code verdict.
- Convex planar tessellations, nested mapped instances, and straight rectangular/convex-polyline extrusions can render without the native CAD kernel. Curves, concave profiles, tapered solids, CSG and opening subtraction require the IfcOpenShell geometry module. Unsupported geometry stays in the ledger with a visible warning. The direct path rejects an entire unsupported body rather than showing a partial shape.
- No BCF export, IDS import, clash detection, multi-user review, approval signing, server storage, authentication, or job queue is implied.
- The API is intended for local use. Process isolation, import admission, cancellation and resource/time budgets are implemented. Multi-user hosting still requires authentication, per-user quotas, access policy, TLS and operational monitoring. Process separation alone is not a security sandbox.
- Geometry fingerprints are conservative, not topology-aware: vertex/triangle order and winding are ignored, but different triangulation may show as changed. Coordinates are quantized to a 1 µm grid. New GlobalIds cannot be reliably paired; models are not automatically aligned. Unavailable or incompatible geometry is explicitly unverified.
- A single material assignment does not establish a complete construction assembly or measurement standard. Rate ownership and source-model quality remain human responsibilities.
- Default review state is stored on the current browser/device. Clearing browser data removes it. JSON is an evidence export, not an importable workspace backup.

## How to validate whether the approach is worth building further

1. Give three quantity surveyors a model with missing QTO and ask them to identify which items they cannot price. Compare time and missed gaps against their current spreadsheet workflow.
2. Ask two BIM coordinators to explain a revised allowance using only the exported evidence. Record which provenance is still missing.
3. Test five real authoring-tool exports, including metre and millimetre models, material layers, mapped geometry, and regenerated GlobalIds. Add each failure as a regression fixture.
4. Build BCF issue handoff and IDS-backed checks if those interviews show they are needed. They have more practical value than a generic chat panel.

The strongest demonstration is a live change to a material rate, inspection of an excluded slab, and a revision comparison whose totals can be recomputed from the exported ledger.
