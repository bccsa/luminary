# Continue Reading — reading progress tracker

The app saves **in-progress text articles** so the homepage can show a **Continue Reading** row. Progress must reflect articles the user is actually reading, not articles they fling past.

Visual overview: open [`reading-progress-tracker.drawio`](reading-progress-tracker.drawio) in [draw.io](https://app.diagrams.net/) (three tabs: Overview, Two gates, Components).

## Problem we solved

**Old approach:** save scroll depth (how far down the page the user scrolled).

That breaks when someone scrolls quickly to the bottom — the article looks 100% read even though they never read it.

**Current approach:** count individual **content blocks** as read only when visibility and scroll-speed gates both pass.

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
3. When a block passes both gates, it is added to a **confirmed** set.
4. Progress `%` = `confirmed blocks ÷ total blocks`, rounded.
5. `%` is saved to `localStorage` via **globalConfig** (`readingProgress` key).
6. **ContinueReading** on the homepage reads that list and shows matching published articles.

At **100%**, the entry is **removed** from storage (article is considered finished, not “in progress”).

## The two gates

A block is marked read only when **both** conditions are met at the same time.

### Gate 1 — Visibility (IntersectionObserver)

- At least **50%** of the block must be visible inside the scroll container (`READING_INTERSECTION_RATIO = 0.5`).
- Scroll root is `<main>` when it scrolls (see `resolveArticleScrollContainer()`), not the window.
- Block leaves the viewport → partial dwell for that block is discarded.

### Gate 2 — Scroll velocity (scroll listener)

- Dwell time **only accumulates while scroll speed is ≤ 1200 px/s** (`READING_MAX_SCROLL_VELOCITY_PX_S`).
- Above that threshold the user is treated as skimming:
  - dwell **stops accumulating**
  - **all partial dwell** for visible blocks is **cleared**
- When scrolling slows again, dwell starts fresh from zero for still-visible blocks.

Velocity is computed from **batched** scroll samples: individual events shorter than **50 ms** are combined before measuring speed (`READING_MIN_SCROLL_SAMPLE_MS`). That avoids missing fast trackpad flings between high-frequency events.

## How dwell time works

Dwell is **not** a wall-clock `setTimeout`. It is **accumulated milliseconds** added on each animation frame while both gates pass.

Per-block threshold from `computeBlockDwellMs()` in `app/src/util/readingTime.ts`:

```
dwellMs = (blockWordCount ÷ languageWPM) × 60 000
clamped to 500 ms … 8 000 ms
```

- **WPM** comes from the content language’s `averageReadingSpeed`, default **200** when unset.
- Short blocks still need at least **500 ms** of effective dwell.
- Very long blocks cap at **8 s**.

When accumulated dwell for a block reaches its threshold, the block is confirmed and progress is persisted (if the percentage increased).

## Progress persistence rules

- Stored shape: `[{ contentId, progress }, …]` in `localStorage.readingProgress`.
- Progress **never decreases** for a given article (`Math.max(existing, computed)`).
- On re-open, saved `%` **seeds** the confirmed set (same `Math.round` as when saving) so progress does not drop if the tracker re-initializes.
- Saved `%` is also used to **scroll** the user back near where they left off.

## Return visit: scroll restore

When the user reopens an in-progress article:

1. After a **300 ms** delay, the scroll container jumps to `progress%` of max scroll.
2. For **400 ms** after that (`READING_RESTORE_GUARD_MS`), tracking is suppressed so the programmatic scroll does not count as reading.

## When tracking is disabled

The composable is **off** when:

- Content has a **video** (video posts use a different UX)
- Content has **no text**
- Content id is missing

## Key files

| File | Role |
|------|------|
| `app/src/pages/SingleContent/SingleContent.vue` | Wires tracker to prose root, scroll container, language WPM |
| `app/src/composables/useReadingProgressTracker.ts` | Visibility + velocity gates, dwell loop, restore |
| `app/src/util/readingTime.ts` | WPM resolution, word count, dwell math, UI reading-time estimate |
| `app/src/globalConfig.ts` | Read/write `localStorage.readingProgress` |
| `app/src/components/HomePage/ContinueReading.vue` | Homepage row from saved progress |

## Constants (quick reference)

| Constant | Value | Meaning |
|----------|-------|---------|
| `READING_INTERSECTION_RATIO` | `0.5` | Block must be half visible |
| `READING_MAX_SCROLL_VELOCITY_PX_S` | `1200` | Above this = skimming |
| `READING_MIN_SCROLL_SAMPLE_MS` | `50` | Batch scroll events before velocity check |
| `READING_RESTORE_GUARD_MS` | `400` | Ignore tracking after programmatic restore |
| `READING_MIN_DWELL_MS` | `500` | Minimum dwell per block |
| `READING_MAX_DWELL_MS` | `8000` | Maximum dwell per block |
| `DEFAULT_READING_SPEED_WPM` | `200` | Fallback when language has no WPM |

## Tests

Unit tests live in:

- `app/src/composables/useReadingProgressTracker.spec.ts`
- `app/src/util/readingTime.spec.ts`
