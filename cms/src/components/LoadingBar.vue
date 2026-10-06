<template>
    <div class="flex w-full flex-col items-center gap-0">
        <div class="text-sm text-zinc-500" aria-label="Loading...">
            <span class="">Loading</span>
            <span class="inline-block animate-bob-1 text-lg" aria-hidden="true">.</span
            ><span class="inline-block animate-bob-2 text-lg" aria-hidden="true">.</span
            ><span class="inline-block animate-bob-3 text-lg" aria-hidden="true">.</span>
        </div>
        <div class="relative h-2 w-3/5 max-w-md overflow-hidden rounded-full bg-zinc-200 sm:w-1/5">
            <div
                class="absolute bottom-0 top-0 w-1/3 animate-running-slug rounded-full bg-zinc-500"
            ></div>
        </div>
    </div>
</template>
