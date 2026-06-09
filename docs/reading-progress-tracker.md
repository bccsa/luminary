# Continue Reading — reading progress tracker

The app saves **in-progress text articles** so the homepage can show a **Continue Reading** row. Progress must reflect articles the user is actually reading, not articles they fling past.

Visual overview: open [`reading-progress-tracker.drawio.svg`](reading-progress-tracker.drawio.svg) in [draw.io](https://app.diagrams.net/) (three tabs: Overview, Reading gates, Components).

## Problem we solved

**Old approach:** save scroll depth (how far down the page the user scrolled).

That breaks when someone scrolls quickly to the bottom — the article looks 100% read even though they never read it.

**Current approach:** count individual **content blocks** as read only when visibility, block-end, scroll-speed, and dwell gates all pass.

## Where tracking starts

Tracking runs only on **SingleContent** text articles (no video, must have `content.text`).

The tracker watches `articleProseRef` — the `<div v-html="text">` that renders the CMS article body.

**Included in progress**

- Paragraphs, headings, list items, blockquotes, and code blocks inside the article HTML  
  (`p`, `h1`–`h4`, `li`, `blockquote`, `pre`)

**Not included**

- Page title (`content.title`)
- Hero image
- Summary, author, reading time, publish date
- Category tags
- Copyright footer

So progress begins at the **first block inside the article body**, not at the page title. If the CMS HTML starts with an `<h2>`, that heading is the first tracked block.

## End-to-end flow

1. User opens a text article on **SingleContent**.
2. `useReadingProgressTracker` collects blocks from the prose root and observes them.
3. When a block passes all gates, it is added to a **confirmed** set.
4. Progress `%` = `confirmed blocks ÷ total blocks`, rounded.
5. `%` is saved to `localStorage` via **globalConfig** (`readingProgress` key).
6. **ContinueReading** on the homepage reads that list and shows matching published articles.

At **100%**, the entry is **removed** from storage (article is considered finished, not “in progress”).

## The gates

A block is marked read only when **all** conditions below are met.

### Gate 1 — Block visibility (IntersectionObserver)

- At least **50%** of the block must intersect the scroll container (`READING_INTERSECTION_RATIO = 0.5`).
- Scroll root is `<main>` when it scrolls (see `resolveArticleScrollContainer()`), not the window.
- Block leaves the viewport → partial dwell for that block is discarded.

### Gate 1b — Block end in viewport

- The **bottom edge** of the block must be inside the visible scroll area (not below the fold).
- This ensures the user has scrolled through the block, not merely glimpsed the top of a long paragraph.

### Gate 2 — Scroll velocity (scroll listener)

- Dwell time **only accumulates while scroll speed is at or below** `computeMaxScrollVelocityPxS(languageWPM)`.
- At default **200 WPM**, the cap is **1200 px/s** (`READING_BASE_MAX_SCROLL_VELOCITY_PX_S`); faster languages scale proportionally (e.g. 300 WPM → 1800 px/s).
- Above the threshold the user is treated as skimming:
  - dwell **stops accumulating**
  - **all partial dwell** for visible blocks is **cleared**
- When scrolling slows again, dwell starts fresh from zero for still-visible blocks.

Velocity is computed from **batched** scroll samples: individual events shorter than **50 ms** are combined before measuring speed (`READING_MIN_SCROLL_SAMPLE_MS`). That avoids missing fast trackpad flings between high-frequency events.

### Gate 3 — Idle pause

- If there is no scroll or intersection activity for **45 s** (`READING_IDLE_MS`), dwell stops accumulating until the user interacts again.

## How dwell time works

Dwell is **not** a wall-clock `setTimeout`. It is **accumulated milliseconds** added on each animation frame while all gates pass.

Per-block threshold from `computeBlockDwellMs()` in `app/src/util/readingTime.ts`:

```
dwellMs = (blockWordCount ÷ languageWPM) × 60 000
clamped to 500 ms … 8 000 ms
```

- **WPM** comes from the content language’s `averageReadingSpeed`, default **200** when unset.
- Short blocks still need at least **500 ms** of effective dwell.
- Very long blocks cap at **8 s**.

When accumulated dwell for a block reaches its threshold, the block is confirmed and progress is persisted (if the percentage increased).

**No-scroll articles:** On desktop, if every block is already visible (short article), dwell still accumulates via the animation-frame loop without any scroll events.

## Progress persistence rules

- Stored shape: `[{ contentId, progress }, …]` in `localStorage.readingProgress`.
- Progress **never decreases** for a given article (`Math.max(existing, computed)`).
- On re-open, saved `%` **seeds** the confirmed set (same `Math.round` as when saving) so progress does not drop if the tracker re-initializes.

## Return visit: scroll restore

When the user reopens an in-progress article:

1. After a **300 ms** delay, the scroll container jumps to `progress%` of max scroll.
2. For **400 ms** after that (`READING_RESTORE_GUARD_MS`), tracking is suppressed so the programmatic scroll does not count as reading.

Opt-in restore UI (banner/prompt) is deferred pending further UX discussion.

## When tracking is disabled

The composable is **off** when:

- Content has a **video** (video posts use a different UX)
- Content has **no text**
- Content id is missing

## Key files

| File | Role |
|------|------|
| `app/src/pages/SingleContent/SingleContent.vue` | Wires tracker on text articles |
| `app/src/composables/useReadingProgressTracker.ts` | Gates, dwell loop, auto restore on open |
| `app/src/util/readingTime.ts` | WPM resolution, dwell math, skim cap scaling |
| `app/src/globalConfig.ts` | Read/write `localStorage.readingProgress` |
| `app/src/components/HomePage/ContinueReading.vue` | Homepage row from saved progress |

## Constants (quick reference)

| Constant | Value | Meaning |
|----------|-------|---------|
| `READING_INTERSECTION_RATIO` | `0.5` | Block must be half visible |
| `READING_BASE_MAX_SCROLL_VELOCITY_PX_S` | `1200` | Skim cap at 200 WPM |
| `READING_MIN_SCROLL_SAMPLE_MS` | `50` | Batch scroll events before velocity check |
| `READING_RESTORE_GUARD_MS` | `400` | Ignore tracking after programmatic restore |
| `READING_IDLE_MS` | `45000` | Pause dwell after inactivity |
| `READING_MIN_DWELL_MS` | `500` | Minimum dwell per block |
| `READING_MAX_DWELL_MS` | `8000` | Maximum dwell per block |
| `DEFAULT_READING_SPEED_WPM` | `200` | Fallback when language has no WPM |

## Tests

Unit tests live in:

- `app/src/composables/useReadingProgressTracker.spec.ts`
- `app/src/util/readingTime.spec.ts`
