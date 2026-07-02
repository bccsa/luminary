# Research: Offline Full-Text Searching with Fuzzy Search for IndexedDB/Dexie

## Executive Summary

This research document explores implementing **Google-like offline full-text search** with the following requirements:

✅ **Multi-field search**: Search across all relevant ContentDto fields (title, author, text, summary, etc.)  
✅ **Auto-correction**: Automatically handle typos and misspellings (e.g., "authr" → "author", "firemn" → "fireman")  
✅ **Real-time search**: Show results as the user types (like Google)  
✅ **Auto-suggestions**: Provide query completion suggestions  
✅ **Relevance ranking**: Show most relevant results first  
✅ **Offline capability**: Works entirely offline using IndexedDB/Dexie

### Recommended Solution: **MiniSearch + Dexie**

MiniSearch provides all required features:

- ✅ Built-in fuzzy search with typo tolerance
- ✅ Auto-suggestions API (`autoSuggest` method)
- ✅ Real-time search capable (instant results)
- ✅ Multi-field search with field boosting
- ✅ BM25 relevance scoring
- ✅ Works offline with IndexedDB persistence

**Implementation Approach**: Store MiniSearch index in IndexedDB, sync with Dexie operations, provide real-time search with debouncing, and implement auto-suggestions UI.

---

## Current State

### Existing Search Implementation

1. **API Side (CouchDB)**:

   - `SearchReqDto` includes a `queryString` field, but it's not currently implemented
   - Search is primarily based on metadata filters (types, groups, languages, dates, etc.)

2. **Client Side (Dexie/IndexedDB)**:

   - **CMS**: Simple case-insensitive substring matching on `title` field only
     - Location: `cms/src/components/content/query.ts` (line 89-91)
     - Uses: `contentDoc.title.toLowerCase().includes(options.search.toLowerCase())`
   - **APP**: No client-side full-text search currently implemented
   - **ApiLiveQuery**: Throws error if `queryString` is provided (not implemented yet)

3. **Searchable Fields in ContentDto**:
   - `title` (string, required)
   - `summary` (string, optional)
   - `text` (string, optional) - main content body
   - `author` (string, optional)
   - `seoTitle` (string, optional)
   - `seoString` (string, optional)
   - `slug` (string, required)

### Current Database Schema

- **Dexie Version**: 4.0.11
- **Database Name**: `luminary-db`
- **Main Table**: `docs` (stores `BaseDocumentDto` and subtypes)
- **Indexes**: Currently indexed fields include `_id`, `type`, `parentType`, `language`, `expiryDate`, `parentId`, `publishDate`, `parentPinned`, compound indexes for `[type+tagType]` and `[type+postType]`
- **No full-text indexes**: Text fields like `title`, `summary`, `text` are not indexed for search

---

## Dexie's Native Full-Text Search Capabilities

### Limitations

**Dexie.js does NOT have built-in full-text search capabilities**. IndexedDB (which Dexie wraps) only supports:

- Exact matches
- Range queries
- Prefix matching (limited)
- MultiEntry indexes (for array fields)

### What Dexie CAN Do

1. **MultiEntry Indexes**: Can index arrays where each element is searchable

   - Could be used for tokenized keywords
   - Requires manual tokenization of text fields
   - No stemming, no fuzzy matching, no relevance scoring

2. **Filter Operations**: Can filter results in memory after fetching

   - Current CMS approach uses this
   - Requires loading all candidate documents into memory
   - Performance degrades with large datasets

3. **Compound Queries**: Can combine multiple indexed fields
   - Useful for filtering by metadata
   - Not useful for text content search

### Conclusion

**Dexie alone is insufficient for full-text search with fuzzy matching**. A dedicated search library is required.

---

## Available Libraries & Solutions

### 1. MiniSearch

**Overview**: Lightweight, in-memory full-text search engine written in JavaScript

**Features**:

- ✅ Full-text search with relevance scoring (BM25 algorithm)
- ✅ **Fuzzy search** (configurable tolerance) - handles typos automatically
- ✅ **Auto-suggestions** - provides query suggestions as user types
- ✅ **Real-time search** - instant results as user types
- ✅ Prefix search
- ✅ Field boosting
- ✅ Multi-field search (title, author, text, summary, etc.)
- ✅ No external dependencies
- ✅ Works in browser and Node.js
- ✅ Small bundle size (~14KB minified)

**IndexedDB Integration**:

- Index is serializable (can be stored in IndexedDB)
- Need to serialize/deserialize index on load/save
- Can store index separately from data
- Index must be rebuilt when documents change

**Pros**:

- Excellent performance for in-memory searches
- **Built-in fuzzy search with typo tolerance** - automatically corrects mistakes
- **Auto-suggestions API** - provides Google-like query suggestions
- **Real-time search capable** - instant results as user types
- Good documentation
- Actively maintained
- TypeScript support

**Cons**:

- Entire index must be loaded into memory
- Index serialization/deserialization overhead
- Need to manually sync index with Dexie data
- Memory usage grows with dataset size

**Best For**: Medium-sized datasets (< 100K documents), when memory is not a constraint

**Integration Approach**:

1. Store MiniSearch index in IndexedDB (separate object store)
2. Load index on app startup
3. Keep index in sync with Dexie `docs` table
4. Use MiniSearch for queries, Dexie for document retrieval

---

### 2. FlexSearch

**Overview**: Fast, memory-efficient full-text search library

**Features**:

- ✅ Very fast performance
- ✅ Memory efficient
- ✅ Multiple search modes (strict, forward, reverse, full)
- ✅ Field boosting
- ✅ Custom tokenizer support
- ✅ Small bundle size

**IndexedDB Integration**:

- Index is serializable
- Can be stored in IndexedDB
- Similar to MiniSearch approach

**Pros**:

- Excellent performance
- Lower memory footprint than MiniSearch
- Good for large datasets
- Flexible configuration

**Cons**:

- ❌ **No native fuzzy search** (as of Oct 2024)
- Fuzzy search requires workarounds (typo-tolerance via configuration)
- Less intuitive API than MiniSearch
- Documentation could be better

**Best For**: Large datasets where fuzzy search is not critical, or when fuzzy search can be approximated

**Integration Approach**: Similar to MiniSearch

---

### 3. uFuzzy

**Overview**: Ultra-lightweight fuzzy search library optimized for performance

**Features**:

- ✅ Excellent fuzzy search performance
- ✅ Typo tolerance
- ✅ Result highlighting
- ✅ Very small bundle size (~3KB)
- ✅ Fast initialization

**IndexedDB Integration**:

- ❌ **Not designed for IndexedDB integration**
- Purely in-memory
- Would need to load all searchable text into memory
- No built-in persistence

**Pros**:

- Best-in-class fuzzy search performance
- Tiny bundle size
- Simple API
- Very fast

**Cons**:

- No full-text indexing (searches raw strings)
- All data must be in memory
- No relevance scoring
- Not designed for large datasets
- Manual IndexedDB integration required

**Best For**: Small to medium datasets where fuzzy matching is the primary requirement

**Integration Approach**:

1. Extract searchable text from Dexie documents
2. Store in memory array
3. Use uFuzzy to search the array
4. Retrieve full documents from Dexie using matched IDs

---

### 4. dexie-fulltextsearch (Plugin)

**Overview**: Plugin that adds full-text search to Dexie

**Features**:

- ✅ Direct Dexie integration
- ✅ Simple API
- ✅ Uses IndexedDB for storage

**Pros**:

- Native Dexie integration
- No separate index management
- Simple to use

**Cons**:

- ❓ Limited documentation
- ❓ Unknown fuzzy search capabilities
- ❓ Maintenance status unclear
- ❓ May have performance limitations
- Less community adoption than other solutions

**Best For**: Simple use cases if it meets requirements (needs evaluation)

**Integration Approach**: Direct plugin usage (if it supports fuzzy search)

---

### 5. searchfn

**Overview**: Full-text search library designed for IndexedDB

**Features**:

- ✅ Built for IndexedDB persistence
- ✅ BM25 scoring
- ✅ In-memory cache
- ✅ Full CRUD support
- ✅ FlexSearch adapter available

**Pros**:

- Designed specifically for IndexedDB
- Persistent storage built-in
- Good performance characteristics

**Cons**:

- Less mature than MiniSearch/FlexSearch
- Smaller community
- Documentation may be limited
- Fuzzy search capabilities unclear

**Best For**: Projects that need IndexedDB-native solution

---

## Recommended Implementation Approaches

### Approach 1: MiniSearch + Dexie (Recommended)

**Architecture**:

1. **Data Storage**: Continue using Dexie for document storage
2. **Search Index**: Store MiniSearch index in IndexedDB (separate object store or in `luminaryInternals` table)
3. **Sync Strategy**:
   - On document changes (upsert/delete), update MiniSearch index
   - On app startup, load MiniSearch index from IndexedDB
   - Keep index in sync with Dexie operations

**Implementation Steps**:

1. Add MiniSearch dependency
2. Create search index manager that:
   - Initializes MiniSearch with fields: `title`, `summary`, `text`, `author`, `seoTitle`, `slug`
   - Configures field boosting (e.g., `title` > `summary` > `text`)
   - Enables fuzzy search with configurable tolerance
3. Hook into Dexie operations:
   - After `bulkPut`: Update MiniSearch index
   - After document deletion: Remove from index
   - On sync completion: Rebuild index if needed
4. Create search function that:
   - Queries MiniSearch index
   - Returns document IDs with relevance scores
   - Fetches full documents from Dexie
   - Applies additional filters (language, type, permissions, etc.)

**Pros**:

- Best balance of features and performance
- Built-in fuzzy search
- Good relevance scoring
- Well-documented and maintained

**Cons**:

- Index must be kept in sync
- Memory usage for index
- Initial index build time

---

### Approach 2: FlexSearch + Dexie

**Architecture**: Similar to Approach 1, but using FlexSearch

**When to Choose**:

- Need better performance with very large datasets
- Can work around fuzzy search limitations
- Memory efficiency is critical

**Pros**:

- Better performance for large datasets
- Lower memory usage

**Cons**:

- No native fuzzy search (requires workarounds)
- Less intuitive than MiniSearch

---

### Approach 3: uFuzzy + Dexie (Hybrid)

**Architecture**:

1. Store searchable text extracts in IndexedDB (separate table)
2. Load extracts into memory on startup
3. Use uFuzzy for fuzzy matching
4. Retrieve full documents from Dexie

**When to Choose**:

- Fuzzy search is the primary requirement
- Dataset is small to medium (< 50K documents)
- Need minimal bundle size

**Pros**:

- Excellent fuzzy search
- Tiny bundle size
- Simple implementation

**Cons**:

- No relevance scoring
- All searchable text must be in memory
- Less suitable for large datasets

---

### Approach 4: MultiEntry Index + Custom Filtering

**Architecture**:

1. Add tokenized keywords field to documents
2. Create MultiEntry index on keywords
3. Use Dexie queries for exact/prefix matches
4. Apply fuzzy matching in memory filter

**When to Choose**:

- Want to avoid external dependencies
- Simple search requirements
- Small datasets

**Pros**:

- No external dependencies
- Uses native Dexie features
- Simple implementation

**Cons**:

- Limited fuzzy search capabilities
- Manual tokenization required
- Performance issues with large datasets
- No relevance scoring

---

## Google-Like Search Features

### Requirements

The search should provide a **Google-like experience** with:

1. **Real-time search results** as the user types
2. **Auto-correction** of typos and misspellings
3. **Auto-suggestions** showing query completions
4. **Multi-field search** across all relevant fields (title, author, text, summary, etc.)
5. **Relevance ranking** showing most relevant results first

### How MiniSearch Enables These Features

#### 1. Real-Time Search

**Implementation**:

- Use Vue's reactive system with debounced input
- Query MiniSearch on each keystroke (debounced to avoid excessive queries)
- Display results instantly without page refresh

**Example Pattern**:

```javascript
// Vue composable with debounced search
const searchQuery = ref("");
const debouncedQuery = useDebounceFn(searchQuery, 300); // 300ms debounce

watch(debouncedQuery, async (query) => {
  if (query.length >= 2) {
    // Minimum 2 characters
    results.value = await searchIndex.search(query, {
      fuzzy: 0.2,
      prefix: true,
    });
  }
});
```

#### 2. Auto-Correction (Typo Tolerance)

**How it works**:

- MiniSearch's fuzzy search automatically handles typos
- Configurable edit distance (Levenshtein distance)
- Matches documents even with spelling mistakes

**Configuration**:

```javascript
const results = miniSearch.search("authr", {
  fuzzy: 0.2, // Allows ~20% character differences
  prefix: true, // Also matches prefixes
});
// Will match: "author", "authors", "authored", etc.
```

**User Experience**:

- User types "authr" → finds documents with "author"
- User types "seach" → finds documents with "search"
- No need for explicit "Did you mean?" - results just appear

#### 3. Auto-Suggestions

**MiniSearch's `autoSuggest` Method**:

- Provides query completion suggestions
- Based on indexed terms
- Shows popular/completed queries

**Implementation**:

```javascript
// Get suggestions as user types
const suggestions = miniSearch.autoSuggest("auth", {
  fuzzy: 0.2,
  boost: { title: 2 }, // Boost title matches
});

// Returns: ['author', 'authors', 'authored', 'authentication', ...]
```

**UI Integration**:

- Show suggestions dropdown below search input
- Highlight matching portion
- Allow clicking suggestion to search
- Show suggestion count or preview

#### 4. Multi-Field Search

**Search Across All Fields**:

- Index multiple fields: `title`, `author`, `text`, `summary`, `seoTitle`, `slug`
- Search query matches across all fields simultaneously
- Field boosting ensures title matches rank higher

**Configuration**:

```javascript
const miniSearch = new MiniSearch({
  fields: ["title", "author", "text", "summary", "seoTitle", "slug"],
  storeFields: ["_id", "title", "author"], // Fields to return
  searchOptions: {
    fuzzy: 0.2,
    prefix: true,
    boost: {
      title: 3, // Title matches 3x more important
      author: 2, // Author matches 2x more important
      summary: 1.5, // Summary matches 1.5x more important
      text: 1, // Text matches base importance
      seoTitle: 1.5,
      slug: 0.5, // Slug matches less important
    },
  },
});
```

**Search Behavior**:

- Query "fireman" searches across all fields
- Matches in `title` rank highest
- Matches in `author` rank second
- Matches in `text` or `summary` also included
- Results sorted by relevance score

#### 5. Relevance Ranking

**BM25 Algorithm**:

- MiniSearch uses BM25 (Best Matching 25) algorithm
- Considers term frequency, inverse document frequency
- Field boosts influence final scores
- Results automatically sorted by relevance

**Result Format**:

```javascript
[
  { id: 'doc-1', score: 2.5, match: {...} },  // Most relevant
  { id: 'doc-2', score: 1.8, match: {...} },
  { id: 'doc-3', score: 1.2, match: {...} }   // Less relevant
]
```

### Complete Search Experience Flow

1. **User starts typing** → "fire"

   - Debounced input (300ms)
   - Minimum 2 characters before searching

2. **Auto-suggestions appear** (optional):

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

5. **User sees results**:
   - All relevant ContentDto documents
   - Typo automatically handled
   - No "Did you mean?" needed - just works

### Implementation Strategy

#### Phase 1: Basic Real-Time Search

- Implement debounced search input
- Connect to MiniSearch
- Display results as user types
- Basic fuzzy search (0.2 tolerance)

#### Phase 2: Auto-Suggestions

- Add `autoSuggest` API calls
- Create suggestions dropdown UI
- Handle suggestion selection
- Style suggestions to match design system

#### Phase 3: Enhanced Typo Tolerance

- Fine-tune fuzzy tolerance
- Add prefix matching
- Test with common typos
- Optimize for performance

#### Phase 4: Multi-Field Search

- Index all relevant fields
- Configure field boosting
- Test relevance ranking
- Ensure all ContentDto fields searchable

#### Phase 5: Polish & Optimization

- Add result highlighting
- Implement result pagination
- Add search analytics
- Performance optimization

### UI/UX Considerations

1. **Search Input**:

   - Clear visual feedback while typing
   - Loading indicator during search
   - Character count or minimum length indicator

2. **Suggestions Dropdown**:

   - Appears below input
   - Keyboard navigation (arrow keys, enter)
   - Click to select
   - Highlight matching text
   - Show result count preview

3. **Results Display**:

   - Show relevance score (optional, for debugging)
   - Highlight matched terms
   - Show which field matched (title, author, etc.)
   - Pagination for large result sets
   - Empty state when no results

4. **Performance**:
   - Debounce input (300ms recommended)
   - Minimum query length (2-3 characters)
   - Limit initial results (e.g., top 20)
   - Lazy load more results
   - Cache recent searches

### Example: Complete Search Implementation

```typescript
// SearchIndexManager.ts
class SearchIndexManager {
  private miniSearch: MiniSearch<ContentDto>;

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    if (query.length < 2) return [];

    const results = this.miniSearch.search(query, {
      fuzzy: 0.2,
      prefix: true,
      boost: {
        title: 3,
        author: 2,
        summary: 1.5,
        text: 1,
      },
      ...options,
    });

    // Fetch full documents from Dexie
    const docIds = results.map((r) => r.id);
    const docs = (await db.docs.bulkGet(docIds)) as ContentDto[];

    // Apply additional filters (permissions, language, etc.)
    return this.applyFilters(docs, options);
  }

  getSuggestions(query: string, limit = 10): string[] {
    if (query.length < 2) return [];

    const suggestions = this.miniSearch.autoSuggest(query, {
      fuzzy: 0.2,
      boost: { title: 2 },
    });

    return suggestions.slice(0, limit).map((s) => s.suggestion);
  }
}

// Vue Composable
export function useFullTextSearch() {
  const searchQuery = ref("");
  const suggestions = ref<string[]>([]);
  const results = ref<ContentDto[]>([]);
  const isLoading = ref(false);

  // Debounced search
  const debouncedQuery = useDebounceFn(searchQuery, 300);

  // Get suggestions as user types
  watch(searchQuery, (query) => {
    if (query.length >= 2) {
      suggestions.value = searchIndex.getSuggestions(query, 5);
    } else {
      suggestions.value = [];
    }
  });

  // Perform search
  watch(debouncedQuery, async (query) => {
    if (query.length >= 2) {
      isLoading.value = true;
      try {
        results.value = await searchIndex.search(query);
      } finally {
        isLoading.value = false;
      }
    } else {
      results.value = [];
    }
  });

  return {
    searchQuery,
    suggestions,
    results,
    isLoading,
  };
}
```

---

## Implementation Considerations

### 1. Index Synchronization

**Challenge**: Keeping search index in sync with Dexie data

**Solutions**:

- **Event-based**: Hook into Dexie operations (bulkPut, delete)
- **Periodic rebuild**: Rebuild index periodically or on sync completion
- **Version tracking**: Track document versions to detect changes
- **Hybrid**: Event-based updates + periodic validation

**Recommendation**: Event-based updates for real-time sync, with periodic validation

### 2. Index Storage

**Options**:

- Separate IndexedDB object store
- Store in existing `luminaryInternals` table
- Store as blob in IndexedDB

**Recommendation**: Use `luminaryInternals` table (already exists, simple to use)

### 3. Field Selection & Boosting

**Searchable Fields** (from ContentDto):

- `title` (high boost - most important)
- `summary` (medium boost)
- `text` (low boost - main content, but longer)
- `author` (low boost)
- `seoTitle` (medium boost)
- `seoString` (low boost)
- `slug` (low boost)

**Recommendation**: Index all fields with appropriate boosting

### 4. Fuzzy Search Configuration (Auto-Correction)

**Parameters to Configure**:

- **Fuzzy tolerance**: How many character differences allowed (0.0 - 1.0)
  - `0.0` = no typos allowed (exact match)
  - `0.2` = allows ~20% character differences (recommended for auto-correction)
  - `0.3` = more lenient, catches more typos but may return irrelevant results
- **Prefix length**: Minimum prefix for fuzzy matching (default: 2)
- **Max fuzzy terms**: Limit fuzzy expansion to prevent performance issues

**Recommendation**:

- Start with tolerance **0.2** for good balance of typo correction and relevance
- For auto-suggestions, use **0.2-0.3** to show more suggestions
- For final search results, use **0.2** to maintain relevance
- Test with common typos: "authr" → "author", "seach" → "search", "firemn" → "fireman"

**Typo Correction Examples**:

- "authr" (5 chars, 1 typo) → matches "author" with 0.2 tolerance ✅
- "firemn" (6 chars, 1 typo) → matches "fireman" with 0.2 tolerance ✅
- "jak" (3 chars) → matches "jake" with 0.2 tolerance ✅

### 5. Performance Optimization (Real-Time Search)

**Strategies**:

- **Debouncing**: Debounce search input (300ms recommended)

  - Prevents excessive queries while user types
  - Balances responsiveness with performance
  - Use `useDebounceFn` from VueUse or similar

- **Minimum query length**: Require 2-3 characters before searching

  - Reduces unnecessary queries
  - Improves performance for short queries
  - Better user experience (wait for meaningful input)

- **Lazy loading**: Load index on first search, not on startup

  - Faster app initialization
  - Load index in background if needed

- **Incremental updates**: Only update changed documents

  - Faster index updates
  - Reduces memory churn

- **Result limiting**: Limit initial results (e.g., top 20-50)

  - Faster query execution
  - Paginate for more results
  - Better perceived performance

- **Caching**: Cache recent search results

  - Instant results for repeated queries
  - Store in memory or IndexedDB
  - Invalidate on document updates

- **Auto-suggestions optimization**:

  - Limit suggestions to 5-10 items
  - Cache popular suggestions
  - Load suggestions only after 2+ characters

- **Search index optimization**:
  - Store index in IndexedDB for persistence
  - Load index asynchronously
  - Use Web Workers for large datasets (if needed)

### 6. Integration with Existing Query System

**Current System**:

- `ApiLiveQuery` for server queries
- `useDexieLiveQuery` for local queries
- `ApiSearchQuery` type for query parameters

**Integration Points**:

- Add `queryString` support to `ApiSearchQuery`
- Create `useDexieFullTextSearch` composable
- Integrate with existing filter system (types, languages, groups, etc.)
- Support both online (API) and offline (local) search

### 7. Migration Strategy

**Phases**:

1. **Phase 1**: Implement offline search alongside existing system
2. **Phase 2**: Add `queryString` support to API (if needed)
3. **Phase 3**: Unify online/offline search interface
4. **Phase 4**: Optimize and refine based on usage

### 8. Data Privacy & Security

**Considerations**:

- Search index contains text content - ensure proper access control
- Filter results by user permissions before returning
- Consider encrypting index if sensitive data

**Recommendation**: Apply permission filters after search, not in index

---

## Recommended Solution: MiniSearch + Dexie

### Why MiniSearch?

1. **Best feature set**: Full-text + fuzzy search + relevance scoring
2. **Good performance**: Suitable for typical dataset sizes
3. **Well-maintained**: Active development, good documentation
4. **TypeScript support**: Fits with existing codebase
5. **Flexible**: Configurable for different use cases

### Implementation Outline

1. **Setup**:

   ```bash
   npm install minisearch
   ```

2. **Index Manager**:

   - Create `SearchIndexManager` class
   - Handles index initialization, loading, saving
   - Syncs with Dexie operations
   - Provides search interface

3. **Integration Points**:

   - Hook into `db.bulkPut()` for index updates
   - Hook into document deletion for index cleanup
   - Load index on database initialization
   - Save index periodically and on changes

4. **Search Function**:

   - Accepts query string and filters
   - Returns document IDs with relevance scores
   - Fetches full documents from Dexie
   - Applies permission and metadata filters
   - Supports real-time search with debouncing

5. **Auto-Suggestions Function**:

   - Uses MiniSearch's `autoSuggest` method
   - Returns query completion suggestions
   - Debounced to avoid excessive calls
   - Integrates with search input UI

6. **Vue Composable**:
   - Create `useDexieFullTextSearch` composable
   - Integrates with existing `useDexieLiveQuery` pattern
   - Supports reactive search queries
   - Provides real-time search with auto-correction
   - Includes auto-suggestions support
   - Handles loading states and error handling

### Estimated Implementation Effort

- **Index Manager**: 2-3 days
- **Dexie Integration**: 1-2 days
- **Search Function** (with fuzzy search): 1-2 days
- **Auto-Suggestions Function**: 1 day
- **Vue Composable** (with real-time search): 1-2 days
- **UI Components** (search input, suggestions dropdown): 1-2 days
- **Testing & Refinement**: 2-3 days
- **Total**: ~2-3 weeks (including Google-like features)

---

## Alternative: Evaluate dexie-fulltextsearch First

Before implementing MiniSearch, it's worth evaluating `dexie-fulltextsearch`:

1. **Research**: Check if it supports fuzzy search
2. **Test**: Create a proof-of-concept
3. **Compare**: Evaluate against MiniSearch approach
4. **Decide**: Choose based on capabilities and maintenance status

**Time Investment**: 1-2 days for evaluation

---

## Questions to Resolve

1. **Dataset Size**: How many documents typically stored locally?
2. **Search Frequency**: How often will users search?
3. **Fuzzy Search Priority**: Is fuzzy search a must-have or nice-to-have? ✅ **Required for Google-like experience**
4. **Auto-Suggestions**: Should suggestions appear as user types? ✅ **Required for Google-like experience**
5. **Real-Time Search**: Should results update as user types? ✅ **Required for Google-like experience**
6. **Performance Requirements**: What are acceptable search response times? (Target: < 100ms for real-time search)
7. **Memory Constraints**: Any memory limitations to consider?
8. **API Integration**: Should `queryString` be implemented on API side as well?
9. **Search Scope**: Search only ContentDto, or also other document types (TagDto, PostDto, etc.)?
10. **UI/UX**: What should the search interface look like? (Input field, suggestions dropdown, results display)

---

## References

- [Dexie.js Documentation](https://dexie.org/)
- [MiniSearch GitHub](https://github.com/lucaong/minisearch)
- [FlexSearch GitHub](https://github.com/nextapps-de/flexsearch)
- [uFuzzy GitHub](https://github.com/leeoniya/uFuzzy)
- [dexie-fulltextsearch npm](https://www.npmjs.com/package/dexie-fulltextsearch)
- [IndexedDB Full-Text Search Patterns](https://dexie.org/docs/MultiEntry-Index)

---

## Next Steps

1. **Decision**: Choose implementation approach (recommend MiniSearch)
2. **Evaluation** (optional): Test dexie-fulltextsearch if time permits
3. **Proof of Concept**: Implement basic MiniSearch integration
4. **Integration**: Integrate with existing Dexie operations
5. **Testing**: Test with realistic dataset sizes
6. **Refinement**: Optimize based on performance testing
7. **Documentation**: Document usage and API
