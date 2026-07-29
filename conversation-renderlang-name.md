# renderLang: surfacing the language name in prerendered state

## Context

The web tier is prerendered with `vite-ssg` (`app/src/main.web.ts`). For each
route, vite-ssg serializes a per-route `initialState` object and inlines it into
the HTML as a `<script>` blob so the client can hydrate without a flash. One of
those fields is `renderLang` — the language the page was rendered in.

Inspecting the prerendered page source showed:

```js
window.INITIAL_STATE = '{"renderLang":"lang-eng", ...}'
```

For seeded languages the `_id` is human-readable (`lang-eng`), but for any
language created through the CMS the `_id` is a UUID. In the common case the
inlined state therefore contained a non-interpretable identifier, and there was
no way to tell from the page source which language a page had been prerendered
in.

## What `renderLang` actually is

`renderLang` is **not** a display field. It is an internal state-contract key:

- **Set** once, in the SSR branch of the `ViteSSG` callback
  (`main.web.ts:75`), to the language `_id` returned by `ssrRouteLang(routePath)`.
- **Consumed** once, in the client branch (`main.web.ts:85`), as a language
  `_id` and fed straight into `appLanguageIdsAsRef.value = [lang]`, which drives
  i18n UI strings and the content language filter.

So the `_id` is the correct value for the field — it is the robust, unique join
key the client relies on to restore the render language before mount.

## The decision

We wanted the page source to show the language **name** (e.g. "English") without
weakening the existing contract. Three options were considered:

1. **Store the name in `renderLang`, resolve name→`_id` on the client.** Honors a
   literal reading of "renderLang should show the name", but makes the client
   depend on `initialState.languages` being present and on language names being
   unique. Strictly worse as a join key than the `_id`.
2. **Keep `renderLang` as the `_id`, add a `renderLangName` sibling.** Purely
   additive — the client consumption is untouched and continues to work exactly
   as before; the page source just gains a human-readable field.
3. **Store `languageCode` (e.g. "en") instead of the `_id`.** Interpretable and
   stable, resolvable via the existing `initialState.langCodeToId` map, but not
   the full name.

We chose **option 2**. The `_id` remains the source of truth for hydration, and
`renderLangName` is a derived companion that exists only for interpretability of
the inlined state. Nothing on the client reads it — it is there for the person
reading the page source.

## What changed

- `app/src/main.web.ts` — in the SSR branch, alongside
  `initialState.renderLang = lang`, set
  `initialState.renderLangName = langs.find((l) => l._id === lang)?.name ?? ""`.
- `app/src/ssg/README.md` — document the `renderLang` + `renderLangName` pair in
  the i18n SSR section.

The client hydration path is unchanged; hydration is identical to before. The
only observable difference is an extra `renderLangName` field in the inlined
`initialState` JSON.