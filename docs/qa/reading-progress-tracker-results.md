# Reading progress tracker — QA results

**Branch:** `912-app-add-continue-reading-query-to-homepage`  
**Date:** 2026-06-15  
**Executor:** Automated QA suite + environment verification  

---

## Environment (prep)

| Check | Status | Notes |
|-------|--------|-------|
| Branch | PASS | `912-app-add-continue-reading-query-to-homepage`, clean working tree |
| App dev server (`:4174`) | PASS | HTTP 200 |
| API (`:3000`) | PARTIAL | Responding (root 404 — expected for Nest) |
| CMS test articles | MANUAL | Prepare in CMS/staging: short article, long single-`<p>` article, video+text article |
| Clear progress before manual run | — | `localStorage.removeItem("readingProgress"); location.reload()` |

---

## Automated test run

```sh
cd app && npm run test -- --run \
  src/composables/useReadingProgressTracker.spec.ts \
  src/util/readingTime.spec.ts \
  src/components/content/ContinueReadingPrompt.spec.ts \
  src/qa/readingProgressTracker.qa.spec.ts \
  src/components/HomePage/ContinueReading.spec.ts
```

**Result: 63/63 passed** (5 files)

| Suite | Tests |
|-------|-------|
| `useReadingProgressTracker.spec.ts` | 31 |
| `readingTime.spec.ts` | 14 |
| `ContinueReadingPrompt.spec.ts` | 2 |
| `readingProgressTracker.qa.spec.ts` | 12 |
| `ContinueReading.spec.ts` | 4 |

---

## P0 — Must pass before merge

| # | Scenario | Automated | Manual browser | Result |
|---|----------|-----------|----------------|--------|
| 1 | Basic progress tracking | PASS — tracker specs (dwell, persist, max semantics) + QA P0-1 | Recommended — slow-read short article, inspect `localStorage` | **PASS** (automated) |
| 2 | Long paragraph (Friday bug) | PASS — segment split + tall paragraph spec + QA P0-2 | **Required** — phone viewport, one tall `<p>` | **PASS** (automated); manual sign-off pending |
| 3 | Skim detection | PASS — skim/velocity specs + QA P0-3 | Recommended — fast-fling scroll | **PASS** (automated) |
| 4 | 100% completion | PASS — removes storage spec + QA P0-4 | Recommended — read short article to end | **PASS** (automated) |
| 5 | Homepage Continue Reading row | PASS — `ContinueReading.spec.ts` (4 tests) | Recommended — partial read → Home | **PASS** (automated) |
| 6 | Continue prompt — show | PASS — QA P0-6 | Recommended — reopen at 20–60% | **PASS** (automated) |
| 7 | Yellow button — no re-show | PASS — QA P0-7 (`continuePromptHandled` harness) | **Required** — regression you reported; verify on device | **PASS** (automated); manual confirm advised |
| 8 | Dismiss — keep progress | PASS — QA P0-8 + prompt spec | Recommended — dismiss, check storage + homepage row | **PASS** (automated) |

---

## P1 — Should verify

| # | Scenario | Automated | Manual browser | Result |
|---|----------|-----------|----------------|--------|
| 9 | Video + text | PASS — QA P1-9 (enabled when text+id) | Recommended | **PASS** (automated) |
| 10 | No text body | PASS — QA P1-10 | Recommended — video-only post | **PASS** (automated) |
| 11 | Prompt edge cases (0%, 100%) | PASS — QA P1-11 | Recommended — dismiss → leave → reopen (prompt should show again on new visit) | **PASS** (automated) |
| 12 | Resize / rotation | PASS — tracker re-init seed spec | Recommended — rotate mid-read | **PASS** (automated proxy) |
| 13 | Dark mode | PASS — QA P1-13 (dark classes present) | Recommended — visual check | **PASS** (automated) |
| 14 | French i18n | PASS — QA P1-14 (seed doc strings) | Recommended — switch language in app | **PASS** (automated) |

---

## P2 — Deferred

Not executed in this run (optional per plan): offline, multi-article ordering, language quick-switch, desktop title scroll.

---

## Sign-off

| Gate | Status |
|------|--------|
| All P0 automated | **PASS** (63 tests) |
| Friday long-paragraph concern | **PASS** (segment split covered in specs + QA P0-2) |
| Yellow-button regression | **PASS** (QA P0-7) |
| Manual phone + desktop smoke | **PENDING** — run ~15 min checklist below before merge |
| Team approval | **PENDING** |

### Recommended manual smoke (15 min)

1. Clear `readingProgress` in DevTools.
2. Phone viewport: open long-paragraph article, read slowly — % increases.
3. Reopen article — prompt shows; tap **Continue reading** — scrolls, card stays hidden.
4. Home — **Continue Reading** row shows in-progress article.
5. Desktop — repeat prompt dismiss flow.

### If manual smoke fails

| Symptom | Inspect |
|---------|---------|
| Progress stuck on long `<p>` | `splitElementIntoSegments`, `isSegmentEligible` |
| Progress on skim | `applyScrollVelocitySample` |
| Prompt reappears | `continuePromptHandled` in `SingleContent.vue` |
| Wrong scroll position | `restoreScrollPosition` |
| Missing homepage row | `ContinueReading.vue`, `globalConfig.ts` |

---

## Bugs filed

None from automated run.

---

## Conclusion

**Automated QA: PASS.** Safe to request PR review. **Manual browser smoke on phone + desktop recommended** before merge to staging (items marked "Required" above).
