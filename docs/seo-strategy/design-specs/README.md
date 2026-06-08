# Design Specs — SEO-Safe, Offline-First, Multi-Platform Content App

A three-phase proposal for delivering a **client-rendered, offline-first content
app** that is also **fully discoverable by search engines and social crawlers**,
and that runs as a single codebase across **web, mobile, and desktop**.

These specs were **validated by a working proof-of-concept**. Each pattern below
was built and proven before being written down here. The POC is the existence
proof; these documents are the portable blueprint.

## How to read these

Each phase is a standalone Markdown spec. They are written at the level of
**concepts, rules, and decisions** — deliberately **not tied to any specific file
layout, framework, or repository**. An engineer or an AI agent should be able to
read a phase and implement it in any reasonably modern SPA stack.

Where a concrete technology is named, it is a **reference implementation** ("the
POC used X") — an example, not a requirement.

| Phase | Spec | Delivers |
| --- | --- | --- |
| 1 | [phase-1-prerendering-seo-hydration.md](phase-1-prerendering-seo-hydration.md) | Dynamic, API-driven content rendered as crawlable static HTML that hydrates cleanly into the SPA |
| 2 | [phase-2-dependency-tracking-regeneration.md](phase-2-dependency-tracking-regeneration.md) | Knowing exactly which pages go stale on a content change, and regenerating only those — automatically, on events |
| 3 | [phase-3-two-tier-data-offline-platforms.md](phase-3-two-tier-data-offline-platforms.md) | Private group-scoped data, offline support, and the web/mobile/desktop delivery split |

## The single principle that runs through all three phases

> **Hydrate the public, build-time snapshot cleanly first; layer everything
> per-user, private, or offline on top as an explicit post-mount update — never
> during hydration, and never baked into a CDN-served file.**

Phase 1 establishes it. Phase 2 depends on it (the prerendered page is a cache).
Phase 3 generalizes it to auth, group-scoped data, and offline.

## Reading the "Non-goals" sections

Every phase ends with **Non-goals — do NOT build these**. These are not
oversights; they are **deliberate decisions**. An agent implementing this should
treat them as hard constraints. The most important one, stated up front so it is
impossible to miss:

> **Do NOT add a service worker to the web tier, and do NOT try to make the web
> build work offline.** Offline is the job of the native shells (Phase 3). The
> web tier is intentionally online-only so it stays always-fresh and never
> conflicts with the native WebView runtime.

## Status

Proposed, backed by a successful POC. Recommended for adoption.
