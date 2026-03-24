# Change Review

- Date: 2026-03-21 17:35:05 +08:00
- Repository: D:/oxford-nextjs
- Branch: master
- Base Ref: origin/master

## Summary

- Committed file changes: 0
- Working tree file changes: 1
- Total unique files: 1

## File Changes

| File | Scope | Type | Reason |
| --- | --- | --- | --- |
| src/app/page.tsx | working-tree | Modified | Working tree change before push; refine this reason. |

## Commit Log

- No commits found in selected range.

## Reviewer Notes

- Replace generic reasons with product or business intent where needed.
- Confirm the change scope matches what should be pushed.

---

- Date: 2026-03-24 16:16:21 +08:00
- Repository: D:/oxford-nextjs
- Branch: oxford-nextjs-backend
- Scope: pre-push review

## Summary (Appended)

- Total changed paths: 9
- Change intent: Backend PDF indexing, MongoDB cache integration, and GitHub Actions CI/CD setup for Vercel deployment.

## File Changes (Current Working Tree)

| File | Type | Reason |
| --- | --- | --- |
| README.md | Modified/Added | Implements backend indexing pipeline, scaling support, or deployment automation. |
| package-lock.json | Modified/Added | Implements backend indexing pipeline, scaling support, or deployment automation. |
| package.json | Modified/Added | Implements backend indexing pipeline, scaling support, or deployment automation. |
| src/app/page.tsx | Modified/Added | Implements backend indexing pipeline, scaling support, or deployment automation. |
| .github/ | Modified/Added | Implements backend indexing pipeline, scaling support, or deployment automation. |
| docker-compose.yml | Modified/Added | Implements backend indexing pipeline, scaling support, or deployment automation. |
| src/app/api/ | Modified/Added | Implements backend indexing pipeline, scaling support, or deployment automation. |
| src/lib/ | Modified/Added | Implements backend indexing pipeline, scaling support, or deployment automation. |
| src/types/ | Modified/Added | Implements backend indexing pipeline, scaling support, or deployment automation. |

---

- Date: 2026-03-24 17:01:36 +08:00
- Repository: D:/oxford-nextjs
- Branch: master
- Scope: pre-push review

## Summary (Appended)

- Total changed paths: 2
- Change intent: Fix Vercel production 500 by making PDF indexing resilient when serverless fs cannot access public assets.

## File Changes (Current Working Tree)

| File | Type | Reason |
| --- | --- | --- |
| src/app/api/pdf-index/route.ts | Modified | Pass deployment origin (aseUrl) to indexer so it can fetch static PDF from same host when fs path is unavailable. |
| src/lib/server/pdf-indexer.ts | Modified | Add static-host fetch fallback for PDF bytes and keep indexing/caching working on Vercel serverless. |

---

- Date: 2026-03-24 17:20:09 +08:00
- Repository: D:/oxford-nextjs
- Branch: master
- Scope: pre-push review

## Summary (Appended)

- Total changed paths: 1
- Change intent: Improve Vercel runtime compatibility by removing server worker-module dependency in backend PDF parsing.

## File Changes (Current Working Tree)

| File | Type | Reason |
| --- | --- | --- |
| src/lib/server/pdf-indexer.ts | Modified | Use pdf.js in disableWorker mode without importing pdf.worker.mjs, which can fail in serverless bundling/runtime. |

---

- Date: 2026-03-24 18:39:05 +08:00
- Repository: D:/oxford-nextjs
- Branch: master
- Scope: pre-push review

## Summary (Appended)

- Total changed paths: 2
- Change intent: Eliminate production 500 from index API by returning safe fallback and allowing client-side PDF render when backend index is unavailable.

## File Changes (Current Working Tree)

| File | Type | Reason |
| --- | --- | --- |
| src/app/api/pdf-index/route.ts | Modified | Return fallback index payload instead of HTTP 500 when backend indexing throws. |
| src/app/page.tsx | Modified | Accept missing/failed index response and derive base PDF width from client-loaded PDF to keep rendering functional. |

---

- Date: 2026-03-24 18:49:38 +08:00
- Repository: D:/oxford-nextjs
- Branch: master
- Scope: pre-push review

## Summary (Appended)

- Total changed paths: 1
- Change intent: Keep interactions working in production by computing PDF anchors client-side when backend index API returns fallback mode.

## File Changes (Current Working Tree)

| File | Type | Reason |
| --- | --- | --- |
| src/app/page.tsx | Modified | Add client-side text mapping fallback using pdf.js text content to generate anchors when /api/pdf-index cannot index on server. |

---

- Date: 2026-03-24 19:18:35 +08:00
- Repository: D:/oxford-nextjs
- Branch: master
- Scope: pre-push review

## Summary (Appended)

- Total changed paths: 1
- Change intent: Reduce perceived PDF load latency by rendering as soon as document bytes are ready while index mapping resolves asynchronously.

## File Changes (Current Working Tree)

| File | Type | Reason |
| --- | --- | --- |
| src/app/page.tsx | Modified | Decouple initial canvas render from /api/pdf-index latency and update interaction mapping without forced redraw once anchors arrive. |

---

- Date: 2026-03-24 19:21:15 +08:00
- Repository: D:/oxford-nextjs
- Branch: master
- Scope: pre-push review

## Summary (Appended)

- Total changed paths: 1
- Change intent: Ensure PDF and index complete in the same load phase while still starting index request as early as possible.

## File Changes (Current Working Tree)

| File | Type | Reason |
| --- | --- | --- |
| src/app/page.tsx | Modified | Start /api/pdf-index immediately, then wait on Promise.all([pdfLoad, indexFetch]) and apply base width/mapping together after both are ready. |

---

- Date: 2026-03-24 19:50:35 +08:00
- Repository: D:/oxford-nextjs
- Branch: master
- Scope: pre-push review

## Summary (Appended)

- Total changed paths: 1
- Change intent: Center PDF and canvas presentation area in layout.

## File Changes (Current Working Tree)

| File | Type | Reason |
| --- | --- | --- |
| src/app/page.tsx | Modified | Centered section/container with max width and auto margins so PDF/canvas block stays centered consistently. |
