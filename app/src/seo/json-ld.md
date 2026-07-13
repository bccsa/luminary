# JSON-LD: remaining work for answer-ready content pages

`contentHead.ts` currently emits a minimal `Article` JSON-LD object with a
headline, description, optional person author, published/modified dates, and
language. That is valid baseline metadata, but it does not yet give search and
AI answer systems enough context to reliably identify the source, its primary
page, its image, or its place in the site.

## Article fields still to add

Add these fields to the `Article` object emitted by `articleJsonLd()` at SSG
time. Keep them derived from the same public content document used to render
the page, so the page and structured data cannot disagree.

| Field | Why it matters | Intended source |
| --- | --- | --- |
| `publisher` | Identifies Luminary as the organization behind the article. AI answers and search results use this to establish source attribution. | A public site configuration value: organization name, canonical URL, and an absolute logo URL. Emit `{ "@type": "Organization", "name", "url", "logo": { "@type": "ImageObject", "url" } }`. |
| `image` | Required for Google Article rich-result eligibility and useful for visual citation/preview systems. | The largest image selected from `content.parentImageData.fileCollections`, using the same bucket URL logic as the existing `og:image` tags. Emit an absolute image URL, or an `ImageObject` with `url`, `width`, and `height`. |
| `mainEntityOfPage` | Explicitly binds the article entity to its canonical web page and prevents ambiguity when the content is syndicated or translated. | The absolute canonical article URL already calculated for the head: `{ "@type": "WebPage", "@id": canonicalUrl }`. |
| `wordCount` | Helps systems assess article depth and answer relevance. | The content document's existing word-count field. Confirm the exact DTO property and emit it as a number only when present. |
| `articleSection` | Supplies topical context beyond the headline, improving retrieval and answer grounding. | The content's `parentTags`, resolved at prerender time to published category content documents and their user-facing names. Emit an array when the content belongs to multiple categories. |

Do not emit empty strings, placeholder URLs, unpublished tags, or image values
when their underlying public data is unavailable. JSON-LD should describe the
prerendered public page, not internal identifiers or editor-only metadata.

## Site-wide structured data still to add

These objects are not article-specific and should be emitted once per relevant
page through the same centralized SEO helper.

### `BreadcrumbList` on article pages

Build breadcrumbs from the public tag hierarchy, ending in the current article.
Each `ListItem` needs a one-based `position`, display `name`, and absolute
`item` URL. A typical path is:

```text
Home → Category → Subcategory → Article title
```

Only include ancestors that have stable public URLs. If tags do not yet have
public landing pages, retain their names but defer their `item` URLs rather than
inventing routes.

### `WebSite` and `SearchAction` on `/`

Emit a `WebSite` object on the home page with the canonical site URL and name.
Add a `potentialAction` `SearchAction` that points to the public search URL and
uses the anonymous query parameter accepted by the app:

```json
{
  "@type": "SearchAction",
  "target": "https://example.org/explore?q={search_term_string}",
  "query-input": "required name=search_term_string"
}
```

`/explore?q=<term>` is the supported public search URL. The value is a normal
URL query value and must be encoded with `encodeURIComponent` (or
`URLSearchParams`); the app trims it, opens the existing anonymous FTS overlay,
and executes the search. It does not describe authenticated, personalized, or
server-side search behavior.

## Implementation checks

- All URLs (`@id`, `url`, image, logo, breadcrumb items, and search target) are
  absolute production URLs during the web build.
- The rendered `<script type="application/ld+json">` is valid JSON and has no
  `undefined` keys.
- Article image JSON-LD and `og:image` reference the same public rendition.
- Translated pages use their own canonical URL and language, while the
  organization and site identity remain consistent.
- Validate a representative article, an article with no image, a translated
  article, and `/` using Schema.org Validator or Google Rich Results Test after
  deployment.
