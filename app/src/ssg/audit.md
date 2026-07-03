# `useHead` SEO & AI Citation Audit

## What You're Doing Right

- **Server-side prerendered** via `@unhead/vue` — critical, and you've nailed this
- **Canonical URL** on every page
- **hreflang alternates** with `x-default` — solid internationalisation
- **Basic Article JSON-LD** with `headline`, `description`, `author`, `datePublished`, `dateModified`
- `robots: index,follow` explicit
- **OG + Twitter cards**

This is a competent baseline. A lot of ministry sites don't even have half of this.

---

## The Gaps, Ranked by Impact

### 1. JSON-LD is thin — the `sameAs` problem

This is the biggest miss relative to the GEO/AI SEO strategy. Your Article schema has no entity disambiguation.

```js
// What you have
author: { "@type": "Person", name: c.author }

// What you need
author: {
  "@type": "Person",
  "@id": `${WEB_ORIGIN}/team/${authorSlug}#person`,
  name: c.author,
  sameAs: [
    "https://en.wikipedia.org/wiki/...",
    "https://www.wikidata.org/wiki/...",
    "https://orcid.org/...",
    "https://twitter.com/..."
  ]
}
```

Without `sameAs`, the model sees a name string — `"John Smith"` — with no way to connect it to the John Smith in Wikipedia or Wikidata. The disambiguation signals are entirely absent. The same applies to your Organization (publisher), which is missing entirely.

---

### 2. Missing `publisher` block

Every article should declare who published it. This is one of the primary signals for AI attribution:

```js
publisher: {
  "@type": "Organization",
  "@id": `${WEB_ORIGIN}/#organization`,
  name: appName,
  url: WEB_ORIGIN,
  sameAs: [
    "https://en.wikipedia.org/wiki/...",
    "https://www.wikidata.org/wiki/...",
    "https://www.youtube.com/@handle",
  ]
}
```

---

### 3. `inLanguage` is passing a raw doc ID

```js
// What you have — passes something like "lang-eng"
inLanguage: c.language;

// What you need — proper BCP-47
inLanguage: lang; // you already compute this above, just use it
```

You noted this with a TODO comment yourself. It's worth fixing — `inLanguage: "lang-eng"` is invalid schema and will fail Google's Rich Results Test.

---

### 4. Missing `mainEntityOfPage`

Without this, the schema doesn't explicitly tie the Article entity to the URL it lives on:

```js
mainEntityOfPage: {
  "@type": "WebPage",
  "@id": url
}
```

---

### 5. Missing `image`

You have no `og:image` and no `image` in JSON-LD. AI citation systems and social previews both use this. Even a fallback to a site-wide default is better than nothing:

```js
// In meta
{ property: "og:image", content: c?.heroImage || `${WEB_ORIGIN}/og-default.jpg` }
{ property: "og:image:width", content: "1200" }
{ property: "og:image:height", content: "630" }

// In JSON-LD
image: c?.heroImage || `${WEB_ORIGIN}/og-default.jpg`
```

---

### 6. `@id` anchor missing on Article

Without a stable `@id` on the article itself, you can't cross-reference it from other schemas (e.g., a breadcrumb or FAQ block that references this page):

```js
"@id": `${url}#article`
```

---

### 7. No `speakable` spec

Relevant for voice AI and GEO scoring. Points the model at the most quotable content:

```js
speakable: {
  "@type": "SpeakableSpecification",
  cssSelector: [".article-summary", "h1", "h2"]
}
```

---

### 8. No `about` with Wikipedia-linked entities

For biblical/theological content specifically, this is a real missed opportunity. Every article about Romans 9, justification, etc. should declare its topic entities:

```js
about: [
    {
        "@type": "Thing",
        name: "Epistle to the Romans",
        sameAs: "https://en.wikipedia.org/wiki/Epistle_to_the_Romans",
    },
];
```

This can be driven from existing tags/categories on the content if those exist in your data model.

---

## The Upgraded `useHead` Block

```js
useHead(
  computed(() => {
    const c = content.value;
    const hasDoc = !!c?.slug;
    const title = hasDoc ? `${c!.seoTitle || c!.title} - ${appName}` : appName;
    const description = (hasDoc && (c!.seoString || c!.summary)) || "";
    const url = hasDoc ? `${WEB_ORIGIN}/${c!.slug}` : WEB_ORIGIN || "/";
    const lang = (c?.language || "").replace(/^lang-/, "") || "en";
    const image = c?.heroImage || `${WEB_ORIGIN}/og-default.jpg`;

    const alts = hreflangAlternates.value;
    const altLinks = alts.map((a) => ({
      rel: "alternate",
      hreflang: a.code,
      href: `${WEB_ORIGIN}/${a.slug}`,
    }));
    const xDefault = alts.find((a) => a.code === "en") ?? alts[0];

    // Reusable organization entity — defined once, referenced by @id everywhere
    const orgEntity = {
      "@type": "Organization",
      "@id": `${WEB_ORIGIN}/#organization`,
      name: appName,
      url: WEB_ORIGIN,
      sameAs: [
        // TODO: fill in once Wikipedia/Wikidata entries exist
        // "https://en.wikipedia.org/wiki/YourMinistry",
        // "https://www.wikidata.org/wiki/QXXXXXXX",
        // "https://www.youtube.com/@YourChannel",
      ],
    };

    const articleSchema = hasDoc
      ? {
          "@context": "https://schema.org",
          "@type": "Article",
          "@id": `${url}#article`,
          headline: c!.title,
          description,
          url,
          inLanguage: lang,                        // fixed: was c.language (doc ID)
          image: image,
          datePublished: c!.publishDate
            ? new Date(c!.publishDate).toISOString()
            : undefined,
          dateModified: c!.updatedTimeUtc
            ? new Date(c!.updatedTimeUtc).toISOString()
            : undefined,

          // Tie article to the page it lives on
          mainEntityOfPage: {
            "@type": "WebPage",
            "@id": url,
          },

          // Author with entity disambiguation
          author: c!.author
            ? {
                "@type": "Person",
                // TODO: make dynamic once author slugs exist in data model
                "@id": `${WEB_ORIGIN}/team/${c!.authorSlug || ""}#person`,
                name: c!.author,
                sameAs: c!.authorLinks || [],
                // c.authorLinks would be an array of URLs from your CMS:
                // Wikipedia, Wikidata, ORCID, Twitter, etc.
              }
            : undefined,

          // Publisher — your organization as a declared entity
          publisher: orgEntity,

          // Topic entities — drive from tags/categories if they exist in your model
          about: c!.topics?.map((t: { name: string; wikiUrl?: string }) => ({
            "@type": "Thing",
            name: t.name,
            ...(t.wikiUrl ? { sameAs: t.wikiUrl } : {}),
          })) || undefined,

          // Speakable — points AI/voice at quotable content
          speakable: {
            "@type": "SpeakableSpecification",
            cssSelector: [".article-summary", "h1", "h2"],
          },
        }
      : null;

    return {
      title,
      htmlAttrs: { lang },
      link: [
        { rel: "canonical", href: url },
        ...altLinks,
        ...(xDefault
          ? [
              {
                rel: "alternate",
                hreflang: "x-default",
                href: `${WEB_ORIGIN}/${xDefault.slug}`,
              },
            ]
          : []),
      ],
      meta: [
        { name: "description", content: description },

        // Open Graph
        { property: "og:type", content: "article" },
        { property: "og:title", content: c?.seoTitle || c?.title || appName },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:locale", content: lang.replace("-", "_") },

        // Twitter / X
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: c?.seoTitle || c?.title || appName },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },

        { name: "robots", content: "index,follow" },
      ],
      script: articleSchema
        ? [
            {
              type: "application/ld+json",
              innerHTML: JSON.stringify(articleSchema),
            },
          ]
        : [],
    };
  }),
);
```

---

## What Still Needs to Happen Outside This File

The schema is only as strong as the data flowing into it. These CMS/data model additions unlock the most impact:

| Field needed                         | Drives                                          | Priority                       |
| ------------------------------------ | ----------------------------------------------- | ------------------------------ |
| `c.authorSlug`                       | Stable `@id` for Person entity                  | High                           |
| `c.authorLinks[]`                    | `sameAs` on author (Wikipedia, Wikidata, ORCID) | High                           |
| `c.heroImage`                        | `image` in schema + OG image                    | High                           |
| `c.topics[]` with optional `wikiUrl` | `about` entity array                            | Medium                         |
| Organization-level `sameAs` URLs     | Publisher disambiguation                        | Medium (do once, not per-page) |

> **Note on org-level `sameAs`:** Worth hardcoding as constants now, even as empty placeholders, so you know exactly where to drop the URLs once the Wikipedia/Wikidata entries exist. Everything else ideally comes from your CMS/content model.

---

## Validation Checklist

Once deployed, run the output through these tools before calling it done:

- [Google Rich Results Test](https://search.google.com/test/rich-results) — validates JSON-LD parses correctly and `inLanguage` is valid BCP-47
- [Schema.org Validator](https://validator.schema.org) — catches missing required fields and type errors
- [Open Graph Debugger](https://developers.facebook.com/tools/debug/) — confirms `og:image` renders correctly
- [Twitter Card Validator](https://cards-dev.twitter.com/validator) — confirms `twitter:image` resolves
