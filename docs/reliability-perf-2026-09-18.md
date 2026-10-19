# Data reliability and performance overhaul: verification record (2026-09-18)

This change targets smoothness of typing / scrolling / switching documents / search / sync, and "never lose data", without changing product interactions.
Below: problems ↔ files, verification commands and results, measured numbers, residual risks, migration, and the manual test checklist.

## 1. Problems ↔ changes

### Data reliability
| Problem (verified against current code) | Change |
|---|---|
| Slow responses wipe later edits: `pushMirrorDoc` cleared dirty unconditionally on response | `docStore.ts` mirror gains `rev` (local revision) and `baseUpdatedAt`; `markMirrorSynced(id, confirmedRev, serverUpdatedAt)` clears dirty only when rev matches |
| State leaking across documents: `saveDocument` didn't re-check the current document after await | `useEditorSave.ts` writes saveState only if docId is unchanged and the content hasn't been edited since |
| No upload queue: auto / manual / background saves each sent their own PUT | `sync.ts` single-flight queue per document; edits made while a request is in flight merge into the next round; bounded retries (1s, 3s) on network errors / 5xx |
| A lost response when uploading a new local document caused duplicate creation, and edits made during upload were deleted | POST carries `clientKey` (= local id) and the server is idempotent; after upload, compare the whole row with the server, write locally newer content as a dirty mirror, then delete the local copy |
| Server overwrote unconditionally | `updateDocument` in `documents.ts` accepts `baseUpdatedAt` and does an atomic conditional `updateMany`; on mismatch returns 409 with the server's current version; the client first archives the cloud version as a history version, re-pushes once against the new baseline, and shows a toast |
| Switching accounts called `clearMirror` and deleted dirty drafts; with no snapshot, everyone was treated as the same user | New `mirrorOwner.ts` (mirror ownership independent of the login snapshot) and `orphanDrafts.ts` (before switching accounts / signing out, dirty documents move to `xedit-orphan-drafts` and are reclaimed automatically when the same account returns); drafts with unknown ownership are neither claimed nor uploaded |
| In-flight requests from the old account wrote into the new account's state | `sessionEpoch.ts` session epoch; `clearMirror`, account switches and sign-out all bump it; each sync step re-checks the epoch on return |
| If the stash write failed, the old account's dirty documents could be pushed by the new account | `xedit-sync-hold` gate: while ownership is unresolved, sync neither pushes nor drains |
| Probe had no timeout / in-flight results couldn't be invalidated | `sessionProbe.ts` 8s AbortController timeout, epoch number, inFlight released in finally; only a 200 whose body explicitly has no user counts as signed out; a result is discarded if the user signed in again during the probe |
| Local write failures were treated as saved | `persistEditorDocument` catches write failures and returns `local-error`; the status line shows "Couldn't save locally" with a one-time toast; `saveMirrorLocal` writes the body before the index, so nothing is left half-written |
| keepalive on page hide bypassed version safety | keepalive carries `baseUpdatedAt`; no keepalive is sent while that document is in flight |

### Performance
| Problem | Change |
|---|---|
| `applyServerDoc` read and wrote the full index per document | `applyServerDocs(docs)` does one read, one write and one notification per batch; identical content is skipped; a failed single-document write is logged and the batch continues |
| Sidebar search computed every excerpt each time, and `indexOf` read the full body each time | `searchDocIds` only checks for hits; `docIndex` invalidates by `{updatedAt, chars}` without reading bodies |
| livePreview walked every line of code / quote / list blocks | `eachLine` only walks "block ∩ visible range (plus 2 lines each side)"; first/last still use the real block boundaries |
| Sync-scroll anchors ignored image / font / font-size changes; frontmatter offset line numbers | ResizeObserver + delegated image load + `fonts.ready` mark anchors dirty and re-measure on the next frame; `renderMarkdown` passes the number of stripped frontmatter lines as `env.lineOffset` to shift `token.map` |
| Preview re-rendered on any attachment event; split view also computed the outline | Attachment events carry `detail.keys`, and events unrelated to the current body don't re-render; cloud mode doesn't subscribe; `useOutline(…, enabled)` queries the DOM only in reading mode |
| Changing a setting rewrote the whole document body | Separate keys for `xedit-store` (settings) and `xedit-store-doc` (draft); old-key content is migrated automatically on first load |

## 2. Verification commands and results (local machine, 2026-09-18)
```
npx tsc --noEmit        # Only pre-existing errors remain in src/features/landing/components/Comparison.tsx (user's untracked WIP)
npm run lint            # No output
npx vitest run          # Test Files 16 passed, Tests 94 passed
npm run build           # In a clean worktree excluding Comparison.tsx: Compiled successfully
npx prisma validate / generate   # Passed
```
Not run: there is no PostgreSQL on this machine, so `prisma migrate` and real-database concurrency stress tests were skipped; atomicity of the server-side conditional update is guaranteed by the database, and unit tests use a fake prisma. Browser long tasks / frame rate weren't measured (see the manual tests in section 6).

## 3. Measured numbers (unit test assertions in node, not a browser)
| Metric | Before | After |
|---|---|---|
| Syncing 100 documents: index localStorage get / set calls | 100 / 100 | 1 / 1 |
| Syncing 100 documents: `xedit:docs-changed` dispatches | 100 | 1 |
| 3000-line code block, 51-line viewport: lines visited by eachLine | 3000 | 55 |
| 1003-line quote with nested lists, 21-line viewport: decorations | 5205 | 116 |
| Single search over 1000 documents | searchDocs 2.49ms | searchDocIds 0.95ms |
| 100 consecutive lookups with unchanged metadata: body reads | 100 | 1 |
| One settings change: writes to the body key | 1 | 0 |

Inferred, not measured: how much typing lag improves in the browser depends on block length and viewport; the table above only shows that the upper bound on work is now capped.

## 4. Residual risks
- Old clients that don't send `baseUpdatedAt` (old Mac app, Feishu sync) are still last-write-wins; MCP updates unconditionally by design.
- keepalive requests get no response; if one gets a 409 it fails silently, and the content stays dirty until the next regular round.
- Retrying with the same `clientKey` after the document was soft-deleted returns the document in the trash.
- Orphan drafts with unknown ownership currently have no UI to recover them; the data lives in `xedit-orphan-drafts`.
- Conditional-update timestamps are generated in the application layer (`base + 1ms` fallback), so clock skew across multiple instances can make timestamps slightly early.

## 5. Migration and rollback
- `prisma/migrations/20260918000000_document_client_key`: only adds a nullable `clientKey` column and a unique index on `(userId, clientKey)`. Code and migration can ship in either order.
- Rollback: `DROP INDEX "Document_userId_clientKey_key"; ALTER TABLE "Document" DROP COLUMN "clientKey";`, and delete the corresponding row from `_prisma_migrations`.
- New local storage keys: `xedit-mirror-owner`, `xedit-orphan-drafts`, `xedit-sync-hold`, `xedit-store-doc`; the mirror index gains `rev` and `baseUpdatedAt` fields, and old indexes are compatible via defaults. Reverting to old code loses no data (old code ignores the new fields; the old `xedit-store` key still exists but no longer holds the body — after reverting, the draft comes from the store's first load).

## 6. Browser manual test checklist
1. In the middle of a long code block / quote block, type continuously with a Chinese IME, drag-select past the viewport, ⌘A, undo/redo, delete a ``` boundary.
2. Scroll quickly through a 3000-line code block and jump via the outline; watch whether edge lines get highlighted a beat late.
3. Split view: scroll alignment while images in an image-heavy document load in; scrolling right after changing font size / theme; alignment in documents with frontmatter.
4. Outline generation and jumping in reading mode; the outline survives switching between split and reading mode.
5. Two devices (or two browsers) editing the same document at once: the one that saves later should see a conflict toast, with the other copy in version history.
6. Account A has unsynced drafts → sign out → B signs in → back to A: the drafts are recovered and synced.
7. Edit offline → go online: only one PUT, and the latest content reaches the cloud; saves on page hide aren't duplicated.

### 6.1 Manual test results (2026-09-18, local dev, signed-out local mode, Chrome automation)

Test document: 3129 lines / 127k characters, with frontmatter, 3 images, a 40-line quote, a 3000-line js code block and 30 trailing paragraphs.

| Item | Result | Notes |
| --- | --- | --- |
| 1 | Pass | Paste is instant; typing mid-code-block, drag-selecting 25 lines, ⇧PageDown selecting across the virtual viewport to line 1785, two-step ⌘A (fence content first, then the whole document), ⌘Z/⌘⇧Z, deleting the closing ``` re-renders the whole document as code immediately without lag, and undo restores it. Real IME composition can't be simulated by the tooling. |
| 2 | Pass | After 60 wheel ticks inside the code block, all 32 visible lines are highlighted (0 unhighlighted); jumping to "Section 4" in the outline lands 12px from the top, "Section 2" settles at the top. Highlighting delays under ~100 ms can't be measured by the tooling. |
| 3 | Pass (editor → preview direction) | After image 1, "quote line 9" is aligned on both sides; around image 3 / Section 4 the top lines differ by about 1 line. After font size 16.5 → 18px + a theme switch, scrolling the editor still keeps the preview's top line aligned (≤1 line off). The preview → editor direction wasn't verified because the tooling can't trigger pointerenter. |
| 4 | Pass | Reading-mode outline has all 5 heading levels; jumping to "Section 3" lands with 0px offset; switching back and forth between reading and split mode keeps the outline, with no errors. Exiting reading mode returns to "Edit" rather than "Split" by existing design (useEditorViewMode unchanged). |
| 5–7 | Not run | No PostgreSQL on this machine, so the login / cloud path can't start; the corresponding logic is covered by unit tests under tests/. |

Other observations: the console only shows the pre-existing landing-page hydration text mismatch (StartWritingButton "Start Writing / Continue editing local draft"; Home.tsx isn't part of this change), with no other errors. After switching themes, the preview scroll position resets to zero and only realigns once the editor scrolls again — outside the scope of this change; to be confirmed whether this is pre-existing behavior.
