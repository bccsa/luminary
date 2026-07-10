<!-- A 2×3 dot grid drag handle ("grip"). Heroicons ships no grip/drag-handle icon, so this is
     hand-rolled to match the shape used by Material Symbols (`drag_indicator`) and Lucide
     (`grip-vertical`). Sized by the caller via `class` (e.g. `class="h-4 w-4"`); colour follows
     `currentColor`. -->
<template>
    <svg
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
    >
        <circle
            cx="5.5"
            cy="3.5"
            r="1.4"
        />
        <circle
            cx="10.5"
            cy="3.5"
            r="1.4"
        />
        <circle
            cx="5.5"
            cy="8"
            r="1.4"
        />
        <circle
            cx="10.5"
            cy="8"
            r="1.4"
        />
        <circle
            cx="5.5"
            cy="12.5"
            r="1.4"
        />
        <circle
            cx="10.5"
            cy="12.5"
            r="1.4"
        />
    </svg>
</template>
