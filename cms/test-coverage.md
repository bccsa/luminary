# CMS Test Coverage

## Current Coverage Summary

Measured on 2026-08-27 with `npx vitest run --coverage`.

| Metric     | Coverage | Baseline (before) |
| ---------- | -------- | ----------------- |
| Statements | 84.71%   | 80%               |
| Branches   | 84.88%   | 83%               |
| Functions  | 62.73%   | 49%               |
| Lines      | 84.71%   | 80%               |
| Test Files | 124      | 81                |
| Tests      | 1,042    | 548               |

## Running Coverage

```bash
# Full coverage report (generates HTML report in coverage/)
npx vitest run --coverage

# Coverage for specific files
npx vitest run --coverage src/util/youtubeUtils.spec.ts

# Watch mode (no coverage)
npx vitest
```

The HTML report is generated at `coverage/index.html`.

## Files at 100% Coverage

### Authentication

- `src/auth.ts`
- `src/authFailure.ts`

### Utilities
- `src/util/onlyAllowedKeys.ts`
- `src/util/renderErrorMessage.ts`
- `src/util/slug.ts`
- `src/util/sortByName.ts`
- `src/util/string.ts`
- `src/util/useId.ts`
- `src/util/youtubeUtils.ts`
- `src/util/watchEffectOnce.ts`
- `src/util/getPreferredContentLanguage.ts`
- `src/docsIndex.ts`

### Components
- `src/components/BleedHorizontal.vue`
- `src/components/LoadingBar.vue`
- `src/components/OnlineIndicator.vue`
- `src/components/notifications/LNotification.vue`
- `src/components/notifications/NotificationManager.vue`
- `src/components/modals/LModal.vue`
- `src/components/modals/LanguageModal.vue`
- `src/components/forms/FormLabel.vue`
- `src/components/forms/FormMessage.vue`
- `src/components/forms/LRadio.vue`
- `src/components/forms/LSelect.vue`
- `src/components/forms/LTextToggle.vue`
- `src/components/forms/LTextarea.vue`
- `src/components/forms/LToggle.vue`
- `src/components/common/LTabs.vue`
- `src/components/content/ContentValidator.ts`
- `src/components/content/EditContentVideo.vue`
- `src/components/content/LTag.vue`
- `src/components/content/LanguageSelector.vue`
- `src/components/navigation/TopBar.vue`
- `src/components/languages/LanguageDisplayCard.vue`
- `src/components/languages/LanguageOverview.vue`
- `src/components/editor/icons/BoldIcon.vue`
- `src/components/editor/icons/BulletListIcon.vue`
- `src/components/editor/icons/ItalicIcon.vue`
- `src/components/editor/icons/NumberedListIcon.vue`
- `src/components/editor/icons/StrikethroughIcon.vue`
- `src/components/content/ContentOverview/FilterOptionsMobile.vue`

### S3 / Storage
- `src/components/s3/BucketDisplayCard.vue` (near 100%)

### Navigation
- `src/components/navigation/SideBar.vue` (near 100%)

### Composables & Stores
- `src/composables/attrsWithoutStyles.ts`
- `src/composables/storageValidation.ts` (near 100%)
- `src/tests/mockdata.ts`

### Pages
- `src/pages/DashboardPage.vue`
- `src/pages/NotFoundPage.vue`
- `src/pages/SettingsPage.vue`
- `src/pages/StoragePage.vue`

## Excluded from Coverage

These files are excluded in `vitest.config.ts` and do not count toward coverage metrics:

| File | Reason |
| ---- | ------ |
| `playwright.config.ts` | E2E test configuration, not application logic |
| `postcss.config.js` | Build tool configuration |
| `tailwind.config.ts` | CSS framework configuration |
| `.eslintrc.cjs` | Linter configuration |
| `src/pages/internal/ComponentSandbox.vue` | Internal developer tool for previewing UI components |
| `src/main.ts` | App entry point with side effects (OIDC setup, Sentry, Pinia, Router, Socket.IO). Covered by E2E tests. |

## Files That Cannot Easily Reach 100%

The following measurements come from the same full-suite run as the summary above:

| File                                             | Statements | Branches | Functions | Primary remaining gaps                                                       |
| ------------------------------------------------ | ---------- | -------- | --------- | ---------------------------------------------------------------------------- |
| `src/components/images/ImageEditor.vue`          | 28.36%     | 91.02%   | 38.46%    | FileReader processing, removal flows, and blob URL handling                  |
| `src/components/media/MediaEditor.vue`           | 29.69%     | 81.48%   | 19.04%    | FileReader uploads, replacement confirmation, and language deduplication     |
| `src/components/content/EditContentBasic.vue`    | 43.30%     | 93.57%   | 83.33%    | `<script setup>` initialization and date/redirect edge paths                 |
| `src/components/s3/StorageOverview.vue`          | 79.62%     | 74.24%   | 82.35%    | Credential validation and save/delete error paths                            |
| `src/components/users/UserOverview.vue`          | 87.55%     | 63.82%   | 57.89%    | API-query lifecycle, filtering, pagination, and session persistence branches |
| `src/components/groups/GroupOverview.vue`        | 89.70%     | 73.07%   | 42.85%    | Query callbacks and ACL interaction branches                                 |
| `src/components/media/MediaEditorThumbnail.vue`  | 94.42%     | 78.68%   | 64.28%    | Upload-data rendering and blob cleanup timing                                |
| `src/components/images/ImageEditorThumbnail.vue` | 95.86%     | 90.90%   | 62.50%    | Upload-data srcset and image-key edge cases                                  |

V8 counts generated Vue `<script setup>` functions separately, which can depress function and statement coverage even when template interactions are exercised. Treat these metrics as a map of unexecuted paths, not as a standalone measure of component quality.

## What Was Added

### New Test Files (18 files)
| File | Covers |
| ---- | ------ |
| `src/util/youtubeUtils.spec.ts` | `isYouTubeUrl()`, `extractYouTubeId()` - all URL formats |
| `src/util/watchEffectOnce.spec.ts` | `watchEffectOnce()`, `watchEffectOnceAsync()` |
| `src/util/getPreferredContentLanguage.spec.ts` | All fallback paths |
| `src/util/waitUntilAuthIsLoaded.spec.ts` | Loading states, callback |
| `src/components/BleedHorizontal.spec.ts` | Slot rendering |
| `src/components/editor/icons/EditorIcons.spec.ts` | SVG rendering for Bold, Italic, Strikethrough |
| `src/components/forms/LTextarea.spec.ts` | v-model, slots, states, sizes, disabled, icons, add-ons |
| `src/components/common/LTabs.spec.ts` | Tab click, active state, icons, mobile select |
| `src/components/common/DisplayCard.spec.ts` | Navigation, slots, offline changes badge |
| `src/components/common/LDropdown.spec.ts` | Toggle, keyboard nav, padding, aria-expanded |
| `src/components/redirects/RedirectDisplaycard.spec.ts` | Slugs, type badge, groups, HOMEPAGE fallback |
| `src/components/redirects/RedirectOverview.spec.ts` | List rendering, permission-gated create button |
| `src/components/redirects/RedirectTable.spec.ts` | Table headers, rows, empty state |
| `src/components/navigation/SideBar.spec.ts` | Navigation items, permissions, toggle sections, close emit |
| `src/components/s3/BucketDisplayCard.spec.ts` | Status display, groups, date, edit permission, all status types |
| `src/components/images/ImageEditorThumbnail.spec.ts` | Srcset, blob URL, error fallback, delete dialog, emit events |
| `src/components/media/MediaEditorThumbnail.spec.ts` | Language badge, delete dialog, audio src, blob URL |
| `src/components/users/UserFilterOptions.spec.ts` | Desktop/mobile variant, debounced search, reset filters |

### Extended Test Files (21 files)
| File | What was added |
| ---- | -------------- |
| `src/util/sortByName.spec.ts` | Equal names case, reverse order case |
| `src/util/string.spec.ts` | `getTheFirstLetter()` tests |
| `src/components/common/LPaginator.spec.ts` | First/last page, extended variant, page size, bounds |
| `src/components/common/LTable.spec.ts` | Custom sortMethod, descending sort, sort cycling, unsortable |
| `src/components/button/LButton.spec.ts` | Segmented button, main/right-click, actions, disabled, tooltip |
| `src/auth.spec.ts` | Provider persistence, callback cleanup, silent refresh, provider-scoped token handling, cache clearing, and logout |
| `src/components/modals/ConfirmBeforeLeavingModal.spec.ts` | Stay/discard actions, dialog text verification |
| `src/components/images/ImageEditor.spec.ts` | Empty states, file input, drag events, expose, upload thumbnails |
| `src/components/media/MediaEditor.spec.ts` | Empty collections, expose, upload thumbnails |
| `src/components/groups/EditAclEntry.spec.ts` | Doc type display, multiple permissions, empty permissions, doc type filtering |
| `src/components/navigation/ProfileMenu.spec.ts` | Avatar display, fallback icon, settings nav, language/settings menu items |
| `src/components/common/LPaginator.spec.ts` | Extended variant page click, bounds checking, disabled buttons, pageCount |
| `src/components/editor/RichTextEditor.spec.ts` | Toolbar link/unlink buttons, exposed editor instance |
| `src/components/media/MediaEditorThumbnail.spec.ts` | Play/pause toggle, ended event, global audio coordination |
| `src/components/redirects/RedirectOverview.spec.ts` | Multiple redirects, create modal open |
| `src/components/common/LPaginator.spec.ts` | Disabled navigation when undefined docs, page window near end |
| `src/components/content/EditContentBasic.spec.ts` | Slug auto-generation, slug editing, redirect warning, publish date setter |
| `src/components/s3/StorageOverview.spec.ts` | Validation errors, access denied delete |
| `src/components/groups/GroupOverview.spec.ts` | Permission-gated create button, ConfirmBeforeLeavingModal |
| `src/components/images/ImageEditor.spec.ts` | storageSelection mock, bucket validation, upload data, file size validation, auto-select |
| `src/components/media/MediaEditor.spec.ts` | storageSelection mock, bucket validation, language selector, auto-select |
| `src/components/users/UserOverview.spec.ts` | Permission-gated create, paginator rendering |

## Testing Patterns

### Mocking auth
Use the shared factory instead of hand-rolling a mock — `createAuthMock()` covers every field `@/auth` currently exports, so a superset is always safe:
```typescript
vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
```
Override per test where needed via the mocked `useAuth`:
```typescript
import * as auth from "@/auth";
// ...
(auth as any).useAuth.mockReturnValue({
    isLoading: ref(false),
    isAuthenticated: ref(true),
    user: ref({ name: "Test User", email: "test@example.com" }),
    logout: vi.fn(),
});
```

### Mocking globalConfig
```typescript
vi.mock("@/globalConfig", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        isSmallScreen: ref(false),
        isMobileScreen: ref(false),
    };
});
```

### Mocking vue-router (with currentRoute)
```typescript
vi.mock("vue-router", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            push: vi.fn(),
            currentRoute: ref({ name: "edit" }),
        }),
    };
});
```

### Seeding the Database
```typescript
import { db } from "luminary-shared";
import * as mockData from "@/tests/mockdata";

await db.docs.bulkPut([mockData.mockPostDto, mockData.mockEnglishContentDto]);
```

### Testing Component Events
```typescript
await wrapper.find("input").setValue("test");
expect(wrapper.emitted("update:modelValue")![0]).toEqual(["test"]);
```

### Async Assertions with waitForExpect
```typescript
import waitForExpect from "wait-for-expect";

await waitForExpect(() => {
    expect(wrapper.text()).toContain("Expected text");
});
```

## Policy

- Every new file must ship with corresponding tests
- Aim for >90% statement coverage on new code
- Use `vi.mock` with async factory pattern (shown above) to avoid hoisting issues
- Mock data lives in `src/tests/mockdata.ts`
- Test utilities for EditContent are in `src/components/content/__tests__/EditContent/EditContent.test-utils.ts`
