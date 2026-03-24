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
