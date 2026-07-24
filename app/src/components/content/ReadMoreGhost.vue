<template>
    <div
        class="animate-pulse"
        data-test="read-more-ghost"
        aria-hidden="true"
    >
        <!-- A single skeleton card cell — used in place of a real card slot in ReadMore's grid
             while that slot's data hasn't arrived yet. The grid itself (see ReadMore.vue) always
             renders the same number of slots regardless of loading state, so real cards fill in
             over these placeholders in place instead of the whole section resizing once the feed
             resolves. -->
        <!-- Mobile: image-left row shape, matching ReadMore's mobile card. -->
        <div
            class="flex gap-2 overflow-hidden rounded-lg bg-white shadow ring-1 ring-zinc-950/10 dark:bg-slate-800 dark:ring-white/10 sm:hidden"
        >
            <div class="h-20 w-28 shrink-0 bg-zinc-200 dark:bg-slate-700"></div>
            <div class="flex flex-1 flex-col justify-center gap-2 p-2 pl-0">
                <div class="h-4 w-3/4 rounded bg-zinc-200 dark:bg-slate-700"></div>
                <div class="h-3 w-full rounded bg-zinc-200 dark:bg-slate-700"></div>
                <div class="h-3 w-2/3 rounded bg-zinc-200 dark:bg-slate-700"></div>
            </div>
        </div>

        <!-- Tablet and up: card shape, matching ContentCard's image + text layout. -->
        <div
            class="hidden h-full flex-col gap-1 overflow-hidden rounded-lg bg-white shadow ring-1 ring-zinc-950/10 dark:bg-slate-800 dark:ring-white/10 sm:flex"
        >
            <div class="aspect-[4/3] w-full bg-zinc-200 dark:bg-slate-700"></div>
            <div class="flex flex-col gap-2 p-2">
                <div class="h-4 w-3/4 rounded bg-zinc-200 dark:bg-slate-700"></div>
                <div class="h-3 w-full rounded bg-zinc-200 dark:bg-slate-700"></div>
            </div>
        </div>
    </div>
</template>
