<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { getNavigationItems } from "./navigationItems";

const route = useRoute();
const { t } = useI18n();
const navItems = computed(() => getNavigationItems(t));
const menuRoot = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | undefined;

const syncMenuHeight = () => {
    if (!menuRoot.value) return;
    const height = Math.round(menuRoot.value.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--mobile-menu-h", `${height}px`);
};

onMounted(() => {
    if (!menuRoot.value) return;

    resizeObserver = new ResizeObserver(() => {
        syncMenuHeight();
    });

    resizeObserver.observe(menuRoot.value, { box: "border-box" });
    window.addEventListener("resize", syncMenuHeight);
    syncMenuHeight();
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    window.removeEventListener("resize", syncMenuHeight);
    document.documentElement.style.removeProperty("--mobile-menu-h");
});
</script>

<template>
    <nav
        ref="menuRoot"
        class="pb-[max(0.75rem,calc(env(safe-area-inset-bottom)-0.625rem),calc(var(--native-inset-bottom,0px)+0.5rem))]"
        aria-label="Mobile navigation"
    >
        <ul class="flex items-center justify-around gap-2">
            <li
                v-for="item in navItems"
                :key="item.name"
                class="flex-1"
            >
                <RouterLink
                    :to="item.to"
                    class="flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors"
                    :class="
                        route.name === 'home' && item.to?.name === 'home'
                            ? 'text-zinc-900 dark:text-white'
                            : 'text-zinc-500 dark:text-slate-300'
                    "
                    :aria-current="
                        route.name === 'home' && item.to?.name === 'home' ? 'page' : undefined
                    "
                >
                    <component
                        :is="
                            route.name === 'home' && item.to?.name === 'home'
                                ? item.selectedIcon
                                : item.defaultIcon
                        "
                        class="h-5 w-5"
                    />
                    <span>{{ item.name }}</span>
                </RouterLink>
            </li>
        </ul>
    </nav>
</template>
