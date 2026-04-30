<template>
    <div class="flex w-full flex-col items-center gap-0">
        <div class="text-sm text-zinc-500 dark:text-slate-400" aria-label="Loading...">
            <span class="">Loading</span>
            <span class="animate-bob-1 inline-block text-lg" aria-hidden="true">.</span
            ><span class="animate-bob-2 inline-block text-lg" aria-hidden="true">.</span
            ><span class="animate-bob-3 inline-block text-lg" aria-hidden="true">.</span>
        </div>
        <div
            class="relative h-2 w-3/5 max-w-md overflow-hidden rounded-full bg-zinc-200 sm:w-1/5 dark:bg-slate-700"
        >
            <div
                class="animate-running-slug absolute bottom-0 top-0 w-1/3 rounded-full bg-zinc-500 dark:bg-slate-400"
            ></div>
        </div>
    </div>
</template>
