<script setup lang="ts">
import { MagnifyingGlassIcon } from "@heroicons/vue/24/outline";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { isMac, isMobileScreen } from "@/globalConfig";
import { useContentQuery } from "@/composables/useContentQuery";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

const { openSearch } = useSearchOverlay();
const { t } = useI18n();
const router = useRouter();

const shortcutLabel = computed(() => (isMac.value ? "⌘K" : "Ctrl+K"));
const pinnedCategories = useContentQuery(() => [{ parentPinned: 1 }], {
    cache: true,
    useIndex: "content-parentPinned-publishDate-index",
    sort: [{ publishDate: "desc" }],
});
const hasPinnedCategories = computed(() => pinnedCategories.value.length > 0);

// Desktop opens the search modal overlay; mobile navigates to the dedicated /search page
// (the bottom-menu search button does the same — the modal is desktop-only).
const onSearchClick = () => {
    if (isMobileScreen.value) router.push({ name: "search" });
    else openSearch();
};

// First-time onboarding hint: shimmer the search button to draw attention,
// but only on the user's very first mount. localStorage marker survives
// reloads, so returning users don't see the animation again.
const SHIMMER_FLAG_KEY = "homePageSearchPulseShown";
const shouldShimmer = ref(!localStorage.getItem(SHIMMER_FLAG_KEY));

onMounted(() => {
    if (!shouldShimmer.value) return;
    try {
        localStorage.setItem(SHIMMER_FLAG_KEY, "1");
    } catch {
        // Safari private mode / quota exceeded. The user will just see the
        // shimmer again on their next mount — preferable to crashing the page.
    }
});
</script>

<template>
    <section
        class="px-4 pt-2"
        :class="hasPinnedCategories ? 'bg-yellow-500/10 dark:bg-yellow-500/5' : ''"
    >
        <div class="mx-auto max-w-xl">
            <button
                type="button"
                @click="onSearchClick"
                :aria-label="t('search.ariaLabel')"
                :class="{ 'shimmer-once': shouldShimmer }"
                class="search-button group relative flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-yellow-500 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-yellow-500"
            >
                <MagnifyingGlassIcon
                    class="h-5 w-5 flex-shrink-0 text-zinc-400 transition group-hover:text-yellow-600 dark:text-slate-300 dark:group-hover:text-yellow-500"
                    aria-hidden="true"
                />
                <span class="flex-1 truncate text-sm text-zinc-500 dark:text-slate-400">
                    {{ t("search.hint") }}
                </span>
                <kbd
                    v-if="!isMobileScreen"
                    class="hidden flex-shrink-0 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 sm:inline-block"
                >
                    {{ shortcutLabel }}
                </kbd>
            </button>
        </div>
    </section>
</template>

<style scoped>
/* Attention-getter on mount: a warm yellow highlight sweeps left-to-right
   across the button three times, then fades. border-radius: inherit clips
   the gradient to the button's rounded corners — no overflow:hidden needed
   on the button itself, which would clip the focus/hover shadow. */
.search-button.shimmer-once::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background-image: linear-gradient(
        90deg,
        transparent 25%,
        rgb(234 179 8 / 0.4) 50%,
        transparent 75%
    );
    background-repeat: no-repeat;
    background-size: 200% 100%;
    background-position: 200% 0;
    animation: search-shimmer 1.4s ease-in-out 2 forwards;
}

@keyframes search-shimmer {
    0% {
        background-position: 200% 0;
    }
    100% {
        background-position: -100% 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .search-button.shimmer-once::before {
        animation: none;
    }
}
</style>
