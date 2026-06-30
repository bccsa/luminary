<script setup lang="ts">
import { ref } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { CHART_CARD_WIDTH, type ChartNode } from "./types";

const HOLD_MS = 520;
const HOLD_MOVE_LIMIT = 8;

const props = defineProps<{
    data: ChartNode["data"];
    sourcePosition: Position;
    targetPosition: Position;
}>();

const emit = defineEmits<{
    (e: "select", groupId: string): void;
    (e: "hold", groupId: string, point: { clientX: number; clientY: number }): void;
}>();

const isHolding = ref(false);
const holdStyle = ref<Record<string, string>>({ "--hold-x": "50%", "--hold-y": "50%" });
let holdTimer: number | null = null;
let holdStart: { clientX: number; clientY: number } | null = null;

function clearHold() {
    if (holdTimer !== null) window.clearTimeout(holdTimer);
    holdTimer = null;
    holdStart = null;
    isHolding.value = false;
}

function startHold(event: PointerEvent) {
    if (event.button !== 0) return;

    clearHold();
    holdStart = { clientX: event.clientX, clientY: event.clientY };
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    holdStyle.value = {
        "--hold-x": `${event.clientX - rect.left}px`,
        "--hold-y": `${event.clientY - rect.top}px`,
    };
    isHolding.value = true;
    holdTimer = window.setTimeout(() => {
        if (!holdStart) return;
        emit("hold", props.data.groupId, holdStart);
        clearHold();
    }, HOLD_MS);
}

function cancelHoldOnMove(event: PointerEvent) {
    if (!holdStart) return;

    if (
        Math.abs(event.clientX - holdStart.clientX) > HOLD_MOVE_LIMIT ||
        Math.abs(event.clientY - holdStart.clientY) > HOLD_MOVE_LIMIT
    )
        clearHold();
}
</script>

<template>
    <button
        type="button"
        class="group-graph-node relative overflow-hidden rounded-xl border px-3 py-3 text-center shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        :style="{ width: `${CHART_CARD_WIDTH}px`, ...holdStyle }"
        :class="
            [
                isHolding ? 'is-holding' : '',
                data.selected
                    ? 'border-2 border-zinc-950 bg-zinc-950 text-white'
                    : data.accessState === 'downstream'
                      ? 'border-sky-300 bg-sky-300 opacity-100'
                      : data.accessState === 'upstream'
                        ? 'border-violet-300 bg-violet-300 opacity-100'
                        : data.dimmed
                          ? 'border-zinc-200 bg-white opacity-25'
                          : 'border-zinc-200 bg-white',
            ]
        "
        tabindex="0"
        @click.stop="$emit('select', data.groupId)"
        @pointerdown="startHold"
        @pointermove="cancelHoldOnMove"
        @pointerup="clearHold"
        @pointerleave="clearHold"
        @pointercancel="clearHold"
        @contextmenu="clearHold"
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

<style scoped>
.group-graph-node::after {
    content: "";
    position: absolute;
    left: var(--hold-x);
    top: var(--hold-y);
    height: 18rem;
    width: 18rem;
    border-radius: 9999px;
    background: currentColor;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, -50%) scale(0);
}

.group-graph-node.is-holding::after {
    animation: node-hold-ripple 520ms cubic-bezier(0.2, 0, 0, 1);
}

@keyframes node-hold-ripple {
    0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0);
    }
    55% {
        opacity: 0.12;
    }
    100% {
        opacity: 0.18;
        transform: translate(-50%, -50%) scale(1);
    }
}
</style>
