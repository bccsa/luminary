# Offline Full-Text Search Research Report

**Date**: December 2024  
**Project**: Luminary - Offline Full-Text Search with Fuzzy Search  
**Status**: Research Complete - Ready for Implementation

---

## Executive Summary

This report documents research into implementing **Google-like offline full-text search** capabilities for the Luminary application. The solution must work entirely offline using IndexedDB/Dexie, provide real-time search results, auto-correct typos, and offer query suggestions as users type.

**Key Finding**: Dexie.js does not have built-in full-text search capabilities. A dedicated search library is required.

**Recommended Solution**: **MiniSearch + Dexie** integration provides all required features including fuzzy search, auto-suggestions, real-time search, and relevance ranking.

---

## Current State

### Existing Implementation

1. **API Side (CouchDB)**:

   - `queryString` field exists in `SearchReqDto` but is not implemented
   - Search currently limited to metadata filters (types, groups, languages, dates)

2. **Client Side (Dexie/IndexedDB)**:

   - **CMS**: Simple case-insensitive substring matching on `title` field only
   - **APP**: No client-side full-text search implemented
   - **ApiLiveQuery**: Throws error if `queryString` is provided

3. **Database Schema**:
   - Dexie 4.0.11 with `luminary-db` database
   - Main table: `docs` storing `BaseDocumentDto` and subtypes
   - No full-text indexes on text fields (`title`, `summary`, `text`, etc.)

### Searchable Fields in ContentDto

- `title` (string, required)
- `summary` (string, optional)
- `text` (string, optional) - main content body
- `author` (string, optional)
- `seoTitle` (string, optional)
- `seoString` (string, optional)
- `slug` (string, required)

---

## Requirements

The search implementation must provide:

✅ **Multi-field search**: Search across all relevant ContentDto fields (title, author, text, summary, etc.)  
✅ **Full-text content search**: Search for sentences, phrases, or any text from within the content body  
✅ **Auto-correction**: Automatically handle typos and misspellings (e.g., "authr" → "author")  
✅ **Real-time search**: Show results as the user types (like Google)  
✅ **Auto-suggestions**: Provide query completion suggestions  
✅ **Relevance ranking**: Show most relevant results first  
✅ **Offline capability**: Works entirely offline using IndexedDB/Dexie

### Search Capabilities

**Users will be able to find content by searching for:**

- ✅ **Titles**: "Fireman Jake" → finds content with that title
- ✅ **Author names**: "John Smith" → finds content by that author
- ✅ **Keywords**: "fire safety" → finds content containing those keywords
- ✅ **Sentences from content**: "In the quiet town of Willowdale" → finds content containing that exact sentence
- ✅ **Phrases from content**: "beloved cat, Whiskers" → finds content containing that phrase
- ✅ **Any text from the content body**: Users can search for any portion of the actual article/story text

**Example**: If a user remembers a sentence like "In the quiet town of Willowdale, little Lily wept", they can search for that exact sentence and find the content document containing it, even if they don't remember the title or author.

---

## Solution Analysis

### Dexie Limitations

**Dexie.js does NOT have built-in full-text search capabilities**. IndexedDB (which Dexie wraps) only supports:

- Exact matches
- Range queries
- Prefix matching (limited)
- MultiEntry indexes (for array fields)

**Conclusion**: A dedicated search library is required. Dexie alone is insufficient for full-text search with fuzzy matching.

### Library Comparison

| Library              | Fuzzy Search        | Auto-Suggestions | Real-Time  | IndexedDB | Bundle Size | Recommendation     |
| -------------------- | ------------------- | ---------------- | ---------- | --------- | ----------- | ------------------ |
| **MiniSearch**       | ✅ Yes              | ✅ Yes           | ✅ Yes     | ✅ Yes    | ~14KB       | ⭐ **Recommended** |
| FlexSearch           | ❌ No (workarounds) | ⚠️ Limited       | ✅ Yes     | ✅ Yes    | ~12KB       | Alternative        |
| uFuzzy               | ✅ Excellent        | ❌ No            | ✅ Yes     | ❌ No     | ~3KB        | Too limited        |
| dexie-fulltextsearch | ❓ Unknown          | ❓ Unknown       | ❓ Unknown | ✅ Yes    | Unknown     | Needs evaluation   |

### Recommended Solution: MiniSearch + Dexie

**Why MiniSearch?**

1. ✅ **Complete feature set**: Full-text + fuzzy search + auto-suggestions + relevance scoring
2. ✅ **Built-in typo tolerance**: Automatically corrects mistakes (e.g., "authr" → "author")
3. ✅ **Auto-suggestions API**: Provides query completions via `autoSuggest()` method
4. ✅ **Real-time capable**: Instant search results as user types
5. ✅ **IndexedDB compatible**: Index can be serialized and stored in IndexedDB
6. ✅ **Well-maintained**: Active development, good documentation, TypeScript support
7. ✅ **Good performance**: Suitable for typical dataset sizes (< 100K documents)

---

## Implementation Approach

### Architecture

```
┌─────────────────┐
│   Dexie (DB)    │  ← Stores full documents
│   luminary-db   │
└────────┬────────┘
         │
         │ Sync on changes
         │
┌────────▼────────┐
│  MiniSearch     │  ← Search index (stored in IndexedDB)
│  Index          │
└────────┬────────┘
         │
         │ Query
         │
┌────────▼────────┐
│  Search UI      │  ← Real-time search + suggestions
│  (Vue)          │
└─────────────────┘
```

### Key Components

1. **SearchIndexManager**:

   - Manages MiniSearch index lifecycle
   - Handles index serialization/deserialization
   - Syncs with Dexie operations (bulkPut, delete)
   - Provides search and suggestion APIs

2. **Index Storage**:

   - Store MiniSearch index in IndexedDB (`luminaryInternals` table)
   - Load index on app startup (or lazy load on first search)
   - Save index after updates

3. **Search Function**:

   - Queries MiniSearch index with fuzzy search enabled
   - Returns document IDs with relevance scores
   - Fetches full documents from Dexie
   - Applies additional filters (permissions, language, type, etc.)

4. **Auto-Suggestions Function**:

   - Uses MiniSearch's `autoSuggest()` method
   - Returns query completion suggestions
   - Debounced to avoid excessive calls

5. **Vue Composable**:
   - `useDexieFullTextSearch()` composable
   - Integrates with existing `useDexieLiveQuery` pattern
   - Provides reactive search with real-time updates
   - Handles loading states and error handling

### Configuration

**MiniSearch Setup**:

```javascript
const miniSearch = new MiniSearch({
  fields: ["title", "author", "text", "summary", "seoTitle", "slug"],
  storeFields: ["_id", "title", "author"],
  searchOptions: {
    fuzzy: 0.2, // 20% typo tolerance
    prefix: true, // Enable prefix matching
    boost: {
      title: 3, // Title matches 3x more important
      author: 2, // Author matches 2x more important
      summary: 1.5, // Summary matches 1.5x more important
      text: 1, // Text matches base importance
      seoTitle: 1.5,
      slug: 0.5,
    },
  },
});
```

**Fuzzy Search Settings**:

- **Tolerance: 0.2** (allows ~20% character differences)
- Examples: "authr" → "author", "firemn" → "fireman", "jak" → "jake"

**Full-Text Content Search**:

The `text` field (main content body) is fully indexed, meaning users can search for:

- ✅ **Complete sentences**: "In the quiet town of Willowdale, little Lily wept"
- ✅ **Phrases**: "beneath a dusty porch", "beloved cat, Whiskers"
- ✅ **Partial sentences**: "little Lily wept", "fireman Jake"
- ✅ **Any text from the article**: Users can search for any portion of the content body

**Example**: If a user remembers a sentence like "In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing", they can search for just "little Lily wept" or "beloved cat" and find the content document containing that text, even without knowing the title or author.

- Balances typo correction with relevance

---

## Key Features

### 1. Real-Time Search

- **Debounced input**: 300ms delay to prevent excessive queries
- **Minimum query length**: 2-3 characters before searching
- **Instant results**: Updates as user types
- **Loading states**: Visual feedback during search

### 2. Auto-Correction (Typo Tolerance)

- **Automatic typo handling**: No "Did you mean?" needed
- **Fuzzy matching**: Configurable edit distance (Levenshtein)
- **Examples**:
  - "authr" → finds "author"
  - "seach" → finds "search"
  - "firemn jak" → finds "fireman jake"

### 3. Auto-Suggestions

- **Query completions**: Shows suggestions as user types
- **Based on indexed terms**: Suggests popular/completed queries
- **UI integration**: Dropdown below search input
- **Keyboard navigation**: Arrow keys, enter to select

### 4. Multi-Field Search

- **Searches across all fields**: title, author, text, summary, seoTitle, slug
- **Full-text content search**: The `text` field (main content body) is fully indexed, allowing users to search for:
  - Complete sentences from the content
  - Phrases or partial sentences
  - Any portion of the article/story text
- **Field boosting**: Title matches rank higher than text matches
- **Relevance scoring**: BM25 algorithm for ranking
- **Comprehensive results**: Finds matches in any searchable field

**Example Use Cases**:

- User searches "little Lily wept" → finds content containing that sentence in the `text` field
- User searches "beneath a dusty porch" → finds content with that phrase
- User searches "fireman Jake" → finds content with that in title, author, or text

### 5. Relevance Ranking

- **BM25 algorithm**: Industry-standard relevance scoring
- **Field boosting**: Title matches prioritized over text matches
- **Sorted results**: Most relevant results appear first
- **Score-based**: Each result includes relevance score

---

## User Experience Flow

1. **User starts typing** → "fire"

   - Debounced input (300ms)
   - Minimum 2 characters before searching

2. **Auto-suggestions appear**:

   - "fireman"
   - "fire safety"
   - "fire department"
   - Shows top 5-10 suggestions

3. **User continues typing** → "fireman jak"

   - Real-time search executes
   - Fuzzy search corrects "jak" → "jake"
   - Results appear instantly

4. **Results displayed**:

   - Sorted by relevance
   - Title matches appear first
   - Author matches appear second
   - Text matches included
   - Shows match highlights

5. **User sees all relevant ContentDto documents**:
   - Typo automatically handled
   - No "Did you mean?" needed - just works
   - Results ranked by relevance
   - **Can find content by searching for any sentence or phrase from within the content body**

---

## Implementation Plan

### Phase 1: Basic Real-Time Search (Week 1)

- [ ] Add MiniSearch dependency
- [ ] Create SearchIndexManager class
- [ ] Implement index storage in IndexedDB
- [ ] Hook into Dexie operations (bulkPut, delete)
- [ ] Create basic search function
- [ ] Implement debounced search input
- [ ] Display results as user types

### Phase 2: Auto-Suggestions (Week 2)

- [ ] Implement `autoSuggest` API calls
- [ ] Create suggestions dropdown UI
- [ ] Handle suggestion selection
- [ ] Add keyboard navigation
- [ ] Style suggestions to match design system

### Phase 3: Enhanced Features (Week 2-3)

- [ ] Fine-tune fuzzy tolerance
- [ ] Configure field boosting
- [ ] Add result highlighting
- [ ] Implement result pagination
- [ ] Add loading states and error handling

### Phase 4: Integration & Testing (Week 3)

- [ ] Integrate with existing filter system
- [ ] Apply permission filters
- [ ] Test with realistic dataset sizes
- [ ] Performance optimization
- [ ] Documentation

### Estimated Timeline: **2-3 weeks**

---

## Technical Considerations

### Index Synchronization

**Challenge**: Keeping search index in sync with Dexie data

**Solution**: Event-based updates

- Hook into Dexie `bulkPut()` operations
- Update index when documents change
- Remove from index on document deletion
- Periodic validation to ensure consistency

### Performance Optimization

- **Debouncing**: 300ms delay on search input
- **Minimum query length**: 2-3 characters
- **Result limiting**: Top 20-50 results initially, paginate for more
- **Lazy loading**: Load index on first search, not on startup
- **Caching**: Cache recent search results
- **Incremental updates**: Only update changed documents

### Integration Points

- **Existing Query System**: Integrate with `ApiLiveQuery` and `useDexieLiveQuery`
- **Filter System**: Support existing filters (types, languages, groups, etc.)
- **Permissions**: Apply access control filters after search
- **Vue Composables**: Follow existing patterns for consistency

---

## Risks & Mitigations

| Risk                             | Impact | Mitigation                                         |
| -------------------------------- | ------ | -------------------------------------------------- |
| Index sync issues                | High   | Event-based updates + periodic validation          |
| Memory usage with large datasets | Medium | Lazy loading, result limiting, incremental updates |
| Performance degradation          | Medium | Debouncing, caching, optimization                  |
| Index corruption                 | Low    | Validation, error handling, rebuild capability     |

---

## Success Criteria

✅ Search works entirely offline  
✅ Real-time results as user types  
✅ Auto-correction handles common typos  
✅ Auto-suggestions provide helpful completions  
✅ Multi-field search finds relevant content  
✅ **Full-text content search**: Users can find content by searching for sentences/phrases from within the content body  
✅ Results ranked by relevance  
✅ Performance: < 100ms search response time  
✅ Works with existing filter and permission system

### Search Examples

**Users can find content by searching for:**

1. **Title**: "Fireman Jake" → finds content with that title
2. **Author**: "John Smith" → finds content by that author
3. **Keywords**: "fire safety" → finds content containing those keywords
4. **Sentence from content**: "In the quiet town of Willowdale, little Lily wept" → finds content containing that exact sentence
5. **Phrase from content**: "beneath a dusty porch" → finds content with that phrase
6. **Partial sentence**: "little Lily wept" → finds content with that phrase
7. **With typos**: "firemn jak" → automatically finds "fireman jake" content

All of these searches work offline and return results in real-time as the user types.

---

## Next Steps

1. **Decision**: Approve MiniSearch + Dexie approach
2. **Evaluation** (optional): Test `dexie-fulltextsearch` if time permits (1-2 days)
3. **Proof of Concept**: Implement basic MiniSearch integration (2-3 days)
4. **Full Implementation**: Follow phased implementation plan (2-3 weeks)
5. **Testing**: Test with realistic dataset sizes
6. **Documentation**: Document usage and API

---

## References

- [Dexie.js Documentation](https://dexie.org/)
- [MiniSearch GitHub](https://github.com/lucaong/minisearch)
- [MiniSearch Documentation](https://lucaong.github.io/minisearch/)
- [FlexSearch GitHub](https://github.com/nextapps-de/flexsearch)
- [uFuzzy GitHub](https://github.com/leeoniya/uFuzzy)

---

## Conclusion

**MiniSearch + Dexie** provides the best solution for implementing Google-like offline full-text search with fuzzy search, auto-correction, and real-time suggestions. The solution is well-documented, actively maintained, and provides all required features out of the box.

The implementation can be completed in **2-3 weeks** following the phased approach outlined above, with minimal risk and good performance characteristics for typical dataset sizes.

**Recommendation**: Proceed with MiniSearch + Dexie implementation.

---

**Report Prepared By**: Johan Bell & AI Research Assistant  
**For**: Luminary Development Team  
**Status**: Ready for Implementation Decision
