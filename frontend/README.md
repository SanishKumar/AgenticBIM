# Trace frontend

Next.js 16, React 19, Three.js and component CSS. See the repository README for product scope and setup.

- `npm run dev`: local preview
- `npm test`: deterministic review and revision regression tests
- `npm run lint`: static checks
- `npm run typecheck`: TypeScript checks (run build first to generate Next route types)
- `npm run build`: production build

`lib/model.ts` owns calculations and comparison; `lib/storage.ts` owns browser persistence; `components/model-viewer.tsx` owns the disposable Three.js scene. IFC files and their reproducible parsed snapshots are under `public/demo`.
