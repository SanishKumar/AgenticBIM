# Verification · 18 October 2026

## Workspace recovery and ledger follow-up

- **22 frontend tests passed**, with lint, TypeScript and a production build. Nine new tests cover complete backup round trips, stale note contexts, missing data, unsupported files, duplicate identities, model/geometry budgets, malformed meshes, inconsistent quantity conversions and invalid assumptions/notes.
- In the browser, acknowledged a missing-volume finding, downloaded a workspace backup, changed the concrete rate from 185 to 200 USD/m³, then restored the saved review. The allowance returned from $128,108 to $123,782; the note and its acknowledgement survived a page reload. The slab remained excluded throughout.
- An evidence JSON file was rejected by the backup chooser. No replacement control appeared; the current model, subtotal and acknowledgement stayed intact.
- Ledger paging showed 50, 50 and 35 rows for the 135-element example. The last page disabled Next. Searching from that page for `A1-D01` reset to one matching row. Its CSV download still contained 135 data rows and two explicit exclusions.
- The restore dialog and ledger were checked at a 390-pixel viewport. The dialog had no internal horizontal overflow; the page scroll width equalled its client width. Desktop sizing was restored afterward.
- No browser console errors were observed. The original example workspace was restored after testing. The [restore preview capture](trace-backup.jpg) is from the running app.
- Storage failure behavior is implemented by committing the restore transaction before changing visible state. A real browser quota-exhaustion failure and simultaneous-tab edits were not simulated; backups do not provide multi-user or multi-tab synchronization.

Earlier verification records follow; their test counts describe those earlier revisions.

## Import and packaging follow-up

- [Linux CI run 39031138966](https://github.com/SanishKumar/AgenticBIM/actions/runs/39031138966) passed all three jobs: frontend, backend and containers. This includes **13 frontend and 34 backend tests**, lint, build, production dependency audit and both container import smoke checks. Windows ran 32 backend tests with the two Linux-native checks explicitly skipped.

- Added real-process regressions for timeout, client disconnect, task cancellation and an abruptly exiting worker; each stop path is supervised by the API process.
- Added ASGI checks for chunked and falsely declared body sizes, invalid envelopes, rejected origins, slow uploads, non-queued concurrent imports and slot release after an application failure.
- Added Linux-only integration checks for a cylindrical extrusion, a mapped cylinder and a wall with an opening. These run through the isolated worker and compare mesh volumes with hand-calculated expectations; missing declared quantities must remain unknown.
- The container workflow builds the frontend, API and gateway, waits for health checks, imports a valid IFC over 11 MB through the published endpoint, verifies its 135 meshes and unknown volume, and rejects an oversized request envelope.
- Docker is not installed on the development host. Container and native-kernel results are established by the linked remote workflow, not by a claimed local Docker run.
- Local frontend lint and production build passed after the packaging configuration change. The unpatched development-only braces advisory remains; the standalone runtime does not ship the lint toolchain. Production dependency auditing is now a CI check.
- A live 11,697,387-byte upload through the local Next.js rewrite returned all 135 meshes and the expected undeclared volume after aligning the proxy buffer and timeout with the API limits.
- The [synthetic parser load check](LOAD_CHECK.md) retained all 5,000 elements and 60,000 triangles with a 4.821-second median over three Windows runs. This measures the parser workflow, not browser rendering or customer-model performance.

See [deployment details](DEPLOYMENT.md) for concrete budgets and platform differences. The following sections retain the earlier product and browser verification record.

## Automated checks

- Frontend: **13 tests passed** (`npm test`). Covers complete-model evaluation, explicit exclusion, exact material mapping, composite/unit rejection, threshold tolerance, identity-based revision comparison, unknown deltas, shared-rate repricing, monetary range limits, CSV formula neutralization, unverified geometry, quantity basis/unit changes, tiny quantities and financially meaningful sub-tolerance changes. Rendering tests preserve centimetre details at large survey coordinates and preserve relative displacement between revision meshes.
- Backend: **17 tests passed** (`python -m pytest -q`). Covers metre/millimetre units across all three dimensions, explicit quantity units, custom conversion factors, invalid/ambiguous quantities, subclass deduplication, duplicate GlobalIds, empty models, source tessellation, object placements, and API input limits. New hand-checkable cases cover profile/solid/object placement composition, oblique extrusion, convex/concave profiles, nested nonuniform mapped instances, openings, mixed unsupported bodies, invalid indices, placement/mapping cycles, and fingerprint ordering invariance.
- ESLint: passed.
- TypeScript: passed, including the production build's type check.
- Next.js production build: passed using webpack on Windows. Routes `/`, `/report` (redirect), and `/icon.svg` generated successfully.
- `npm audit --omit=dev`: **0 vulnerabilities** in the 15 October dependency check (dependencies unchanged in this pass). That full audit reported five high advisories in the development-only ESLint / fast-glob / micromatch / braces dependency chain; the suggested forced downgrade is incompatible with the current Next configuration and was not applied.
- Git whitespace check: passed. Windows CRLF conversion notices are informational.

The [GitHub Actions workflow](../.github/workflows/checks.yml) runs both test suites, frontend lint and the production build on Ubuntu with Node.js 22 and Python 3.12. The results above are local checks; [remote run history](https://github.com/SanishKumar/AgenticBIM/actions/workflows/checks.yml) records each pushed revision.

## Browser checks

Verified in a browser against the running local app:

- Initial synthetic workspace: 135 elements, 133 priced, 2 excluded, 3 findings, 4 revision changes.
- Real `.ifc` file chosen through the import dialog and submitted through the frontend proxy. The completed workspace identified the data as `IFC IMPORT`, retained all 135 elements, and cleared the previous baseline.
- Quantity provenance expanded to show the source STEP entity and normalized calculation.
- A review note was recorded; the finding changed to acknowledged while its excluded cost stayed excluded.
- Reloading the workspace and changing the concrete rate recalculated the total and revision impact; the previous acknowledgement was no longer active under the new assumptions.
- Revision table showed one added, one removed and two changed elements with signed monetary deltas.
- Searching the quantity ledger for `A1-D01` returned the correct door and linked source record.
- JSON evidence downloaded through the UI and was parsed from disk: `trace-review/1.0`, 135 elements, 3 findings, 4 changes and 2 excluded elements.
- Model color controls, floor explosion and reset; actual WebGL geometry rendered. The axis marker follows camera orientation and is explicitly the model +Y axis, not geographic north.
- Mobile and desktop breakpoint checks. At the mobile width, document scroll width equalled client width; desktop width also matched. Quantity/review tables intentionally scroll within their containers on small screens.
- No browser console errors observed in the final inspected session.

The first-pass workspace was restored to its original example assumptions after testing. Its captured desktop view is [trace-workspace.jpg](trace-workspace.jpg).

## Revision-workbench follow-up

- The regenerated example has 134 paired GlobalIds with 134 compatible geometry comparisons; one added, one removed and two modified entries.
- Before refreshing the old saved example, all 134 legacy fingerprint pairs were explicitly marked unverified. Its four measured source changes remained inspectable. No old hash was treated as compatible evidence.
- Door evidence shows width changing from 1 m to 0.78 m, declared volume from 0.264 m³ to 0.20592 m³, and allowance from $163.68 to $127.67: a −$36.01 line impact at the same $620/m³ rate.
- Baseline/current display toggles update the rendered preview. A removed partition remains inspectable; its current-only view explicitly states that the identity is absent.
- The development-only canvas frame counter stayed at 2 across idle observations, then advanced on a geometry display change. Floor separation still animates after the demand-rendering change. This is a functional check, not a GPU benchmark.
- At a 390 px viewport, the new workbench exposed a flex minimum-width issue. Setting the main flex child to `min-width: 0` brought its panels inside the viewport. The element rail and evidence table scroll within their containers.
- The downloaded JSON evidence was parsed from disk after the revision changes: 135 elements, four changes, 134 matched identities, 134 geometry comparisons, zero unverified pairs, $123,782 known subtotal and two excluded elements.

The example was restored after the independent import, with no console errors in the final browser inspection. Final workbench capture: [trace-revisions.jpg](trace-revisions.jpg).

## Independent IFC reference check

Parsed buildingSMART's [extruded-solid reference model](https://github.com/buildingSMART/IFC4.x-specification-models/blob/main/models/basic-geometric-shape/extruded-solid/extruded-solid.ifc) through the actual parser. Its IFC4X3 model produced one 12-triangle mesh with metre bounds `[0.5, -0.5, 0]` to `[1.5, 0.5, 2]`, matching the file's millimetre dimensions and placement. Missing quantities remained unknown. This is an independent specification example, not a customer model.

The same file was imported through the browser and Next.js proxy on 17 October. The product rendered the source extrusion, showed `IFC4X3` / `IFC IMPORT`, retained one excluded element with missing material/volume findings, and cleared the prior revision baseline. No synthetic data was substituted.

Downloaded reference SHA-256: `c488f0367106a17289468409531b1b687f72c25cea8e1b46924f59972ad7a8e9`.

The direct extrusion implementation follows [buildingSMART's extruded solid semantics](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcExtrudedAreaSolid.htm) and uses [IfcOpenShell's mapping transforms](https://docs.ifcopenshell.org/autoapi/ifcopenshell/util/placement/index.html).

## Environment and coverage limits

Windows application control blocked the installed IfcOpenShell native geometry module. The included IFC and import test exercise the direct path, which produced all 135 source meshes. Rectangular/convex-profile extrusions and mapped instances now have independent direct-path coverage. Native curved, boolean, B-rep and opening-subtraction geometry remains unverified on this host. Unsupported shapes keep their quantities and emit source warnings; no substitute geometry is invented.

The local API test client required normal local-network permissions outside the restricted shell sandbox. Turbopack workers also failed in this Windows environment; the supported webpack mode completed successfully. The browser preview runs on `127.0.0.1:3000` with the local API on port `8001`; the ignored local environment file reflects that port. Repository defaults remain port `8000`.

No real customer IFC benchmark, large-model browser performance measurement, accessibility audit, independent measurement audit, jurisdiction-specific code validation, or multi-user deployment was performed. The synthetic parser check above is deliberately narrower. Default rates and the model are explicitly illustrative.
