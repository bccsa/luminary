<script setup lang="ts">
import { MagnifyingGlassIcon } from "@heroicons/vue/24/outline";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { isMac, isMobileScreen } from "@/globalConfig";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

const { openSearch } = useSearchOverlay();
const { t } = useI18n();

const shortcutLabel = computed(() => (isMac.value ? "⌘K" : "Ctrl+K"));

// First-time onboarding hint: pulse the search button to draw attention,
// but only on the user's very first mount. localStorage marker survives
// reloads, so returning users don't see the animation again.
const PULSE_FLAG_KEY = "homePageSearchPulseShown";
const shouldPulse = ref(!localStorage.getItem(PULSE_FLAG_KEY));

onMounted(() => {
    if (!shouldPulse.value) return;
    try {
        localStorage.setItem(PULSE_FLAG_KEY, "1");
    } catch {
        // Safari private mode / quota exceeded. The user will just see the
        // pulse again on their next mount — preferable to crashing the page.
    }
});
</script>

<template>
    <section class="bg-yellow-500/10 px-2 pt-2 dark:bg-yellow-500/5">
        <div class="mx-auto max-w-xl">
            <button
                type="button"
                @click="openSearch"
                :aria-label="t('search.ariaLabel')"
                :class="{ 'pulse-once': shouldPulse }"
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
/* Attention-getter on mount: a soft halo breathes around the button twice,
   then fades out. The animation runs once on the first render (CSS
   animations fire on element insertion) — no JS hook needed. Two stacked
   shadows (a tighter brighter core + a wider softer bloom) give the glow
   more depth than a single shadow can produce. forwards keeps the final
   transparent state so the halo doesn't snap back at the end. */
.search-button.pulse-once::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    animation: search-pulse 1.4s ease-in-out 3 forwards;
}

@keyframes search-pulse {
    0%,
    100% {
        box-shadow:
            0 0 0 0 rgb(234 179 8 / 0),
            0 0 0 0 rgb(245 158 11 / 0);
    }
    50% {
        /* Two-stop colour ramp: a tight yellow-500 core fades into an
           amber-500 bloom, giving the glow a warm gradient. Lower blur +
           a touch of spread compared to the all-blur version sharpens
           the edges so it reads as "glow" rather than "mist". */
        box-shadow:
            0 0 14px 2px rgb(234 179 8 / 0.75),
            0 0 36px 6px rgb(245 158 11 / 0.45);
    }
}

@media (prefers-reduced-motion: reduce) {
    .search-button.pulse-once::before {
        animation: none;
    }
}
</style>
