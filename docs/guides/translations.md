# Translation Strings

Luminary's UI strings are stored as `translations` objects in language documents in CouchDB (seeded from `api/src/db/seedingDocs/lang-eng.json` and equivalent files for other languages). At runtime, `app/src/i18n.ts` loads these into [vue-i18n](https://vue-i18n.intlify.dev/) and falls back to the default language for any missing keys.

## Adding or updating translation strings

1. Add the new key and its English string to `api/src/db/seedingDocs/lang-eng.json`.
2. Add the same key (with translated text) to every other `lang-*.json` seed file.
3. Use the key in a Vue component with `t("your.key")` (or with interpolation parameters — see below).

## Named interpolation (placeholder strings)

Some strings contain `{variable}` placeholders that are replaced at runtime. When using these keys, pass the corresponding values as the second argument to `t()`.

| Key | Placeholder | Runtime value | Component |
|-----|-------------|---------------|-----------|
| `search.shortcut` | `{shortcut}` | `"Cmd+K"` on macOS, `"Ctrl+K"` elsewhere | `SearchModal.vue` |
| `notification.content_not_available.description` | `{language}` | Display name of the active language | `SingleContent.vue` |
| `notification.translation_available.description` | `{language}` | Display name of the available language | `SingleContent.vue` |

**Example usage:**

```ts
t("search.shortcut", { shortcut: shortcutLabel })   // → "Cmd+K to open"
t("notification.translation_available.description", { language: "French" })
```

## Conditionally displayed strings

Several strings are only shown under specific UI conditions. When translating these keys, keep the meaning accurate for the stated context.

| Key | Shown when |
|-----|-----------|
| `search.hint` | The search overlay is open and the query is **empty** |
| `search.minCharsShort` | The search overlay is open and the query is **empty** (compact hint, displayed alongside `search.shortcut`) |
| `search.shortcut` | The search overlay is open, query is empty, **and** the screen is `sm` width or wider (hidden on small/mobile screens) |
| `search.minChars` | The query has **1–2 characters** (full-length hint shown below the input) |
| `search.pressGo` | Manual/mobile search mode is active, query has **≥ 3 characters**, and the search has not been submitted yet |
| `search.noResults` | A search returned **zero results** |
| `search.tryDifferent` | A search returned **zero results** (shown directly below `search.noResults`) |

