# Dependency patches

Applied automatically on `npm install` by the `postinstall` script
([patch-package](https://github.com/ds300/patch-package)).

## `vite-ssg+0.23.8.patch`

Adds `jsdom.window.close()` after `jsdom.serialize()` in the prerender loop.

`vite-ssg` builds a `new JSDOM(renderedHTML)` for every prerendered route and never closes it.
Each unclosed instance holds a full DOM tree plus its own Node `vm.Context`, retaining ~13 MB —
measured at 3900 MB vs 160 MB of heap across 300 instances, a 24x difference. Over a full-site
prerender that exhausts any heap the build could reasonably be given, and `build:web` dies with
`Reached heap limit Allocation failed - JavaScript heap out of memory`.

Closing after `serialize()` is safe: `renderPreloadLinks` and `renderDOMHead` both run before
it, and `onPageRendered` afterwards only manipulates the already-serialised HTML string.

The same unclosed-JSDOM code is present in every published `vite-ssg` up to and including
28.3.0, so there is no upgrade that removes the need for this patch. Drop it only once a
release actually closes the window itself.
