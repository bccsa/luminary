<script setup lang="ts">
/**
 * Mute, and with a pointer over it the volume: the player's own card of plus, an upright slider and minus,
 * for a now-playing screen whose tools row has no volume of its own. Sits in that row as one of its tools.
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { MinusIcon, PlusIcon } from "@heroicons/vue/20/solid";
import PlayerIcon from "./PlayerIcon.vue";

const props = defineProps<{ muted: boolean; volume: number }>();
const emit = defineEmits<{
    mute: [muted: boolean];
    volume: [volume: number];
    step: [direction: 1 | -1];
}>();
const { t } = useI18n();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
function onFocusOut(event: FocusEvent) {
    if (!root.value?.contains(event.relatedTarget as Node | null)) open.value = false;
}
const level = () => (props.muted ? 0 : props.volume);
</script>

<template>
    <div
        ref="root"
        class="lmpl-afs-tool"
        @mouseenter="open = true"
        @mouseleave="open = false"
        @focusin="open = true"
        @focusout="onFocusOut"
    >
        <button
            type="button"
            class="lmpl-afs-iconbtn"
            :aria-label="muted ? t('media_player.unmute') : t('media_player.mute')"
            :aria-pressed="muted"
            data-test="mediaPlayerVolumeMute"
            @click="emit('mute', !muted)"
        >
            <PlayerIcon
                :name="muted ? 'volumeOff' : 'volumeHigh'"
                class="h-6 w-6"
            />
        </button>
        <!-- Padded below rather than spaced off, so the pointer crossing to the card stays over the tool. -->
        <div
            v-if="open"
            class="absolute bottom-full left-1/2 z-[5] -translate-x-1/2 pb-2"
            data-test="mediaPlayerVolume"
        >
            <div
                class="flex flex-col items-center gap-1 rounded-xl bg-zinc-900/[0.97] px-1 py-1.5 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14),0_10px_30px_rgb(0_0_0/0.35)]"
            >
                <button
                    type="button"
                    class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
                    :aria-label="t('video_player.volume_up')"
                    data-test="mediaPlayerVolumeUp"
                    @click="emit('step', 1)"
                >
                    <PlusIcon class="h-5 w-5" />
                </button>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    class="volume-slider h-[132px] w-9 cursor-pointer"
                    :style="{ '--level': `${level() * 100}%` }"
                    :value="level()"
                    :aria-label="t('media_player.volume')"
                    :aria-valuetext="`${Math.round(level() * 100)}%`"
                    data-test="mediaPlayerVolumeSlider"
                    @input="emit('volume', Number(($event.target as HTMLInputElement).value))"
                />
                <button
                    type="button"
                    class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
                    :aria-label="t('video_player.volume_down')"
                    data-test="mediaPlayerVolumeDown"
                    @click="emit('step', -1)"
                >
                    <MinusIcon class="h-5 w-5" />
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Upright, bottom to top, with no thumb: the fill is the level, as on the player's own card. */
.volume-slider {
    appearance: none;
    writing-mode: vertical-lr;
    direction: rtl;
    background: transparent;
}
.volume-slider::-webkit-slider-runnable-track {
    inline-size: 100%;
    block-size: 14px;
    border-radius: 9999px;
    background: linear-gradient(to top, #fff var(--level), rgb(255 255 255 / 0.26) var(--level));
}
.volume-slider::-moz-range-track {
    inline-size: 100%;
    block-size: 14px;
    border-radius: 9999px;
    background: linear-gradient(to top, #fff var(--level), rgb(255 255 255 / 0.26) var(--level));
}
.volume-slider::-webkit-slider-thumb {
    appearance: none;
    inline-size: 14px;
    block-size: 14px;
    background: transparent;
    border: 0;
}
.volume-slider::-moz-range-thumb {
    opacity: 0;
    border: 0;
}
.volume-slider:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
    border-radius: 9999px;
}
</style>
