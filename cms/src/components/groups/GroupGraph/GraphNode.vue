<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
import { CHART_CARD_WIDTH, type ChartNode } from "./types";

defineProps<{
    data: ChartNode["data"];
    sourcePosition: Position;
    targetPosition: Position;
}>();

defineEmits<{
    (e: "select", groupId: string): void;
}>();
</script>

<template>
    <button
        type="button"
        class="relative rounded-xl border px-3 py-3 text-center shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        :style="{ width: `${CHART_CARD_WIDTH}px` }"
        :class="
            data.selected
                ? 'border-2 border-zinc-950 bg-zinc-950 text-white'
                : data.accessState === 'downstream'
                  ? 'border-sky-300 bg-sky-300 opacity-100'
                  : data.accessState === 'upstream'
                    ? 'border-violet-300 bg-violet-300 opacity-100'
                    : data.dimmed
                      ? 'border-zinc-200 bg-white opacity-25'
                      : 'border-zinc-200 bg-white'
        "
        tabindex="0"
        @click.stop="$emit('select', data.groupId)"
        @keydown.enter.prevent="$emit('select', data.groupId)"
        @keydown.space.prevent="$emit('select', data.groupId)"
    >
        <Handle
            type="target"
            :position="targetPosition"
            :connectable="false"
            class="chart-handle"
        />
        <div
            class="truncate text-sm font-semibold"
            :class="data.selected ? 'text-white' : 'text-zinc-900'"
        >
            {{ data.name }}
        </div>
        <Handle
            type="source"
            :position="sourcePosition"
            :connectable="false"
            class="chart-handle"
        />
    </button>
</template>
