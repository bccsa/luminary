<script setup lang="ts">
import { computed, ref, nextTick, watch } from "vue";
import { RTextEditor, formatPastedHtml } from "rte-vue";
import BoldIcon from "./icons/BoldIcon.vue";
import ItalicIcon from "./icons/ItalicIcon.vue";
import StrikethroughIcon from "./icons/StrikethroughIcon.vue";
import BulletlistIcon from "./icons/BulletListIcon.vue";
import NumberedListIcon from "./icons/NumberedListIcon.vue";
import LModal from "../modals/LModal.vue";
import LInput from "../forms/LInput.vue";
import LButton from "../button/LButton.vue";
import FormLabel from "../forms/FormLabel.vue";

type Props = {
    title?: string;
    icon?: any;
    disabled: boolean;
};

const props = defineProps<Props>();
const text = defineModel<string>("text");
const textLanguage = defineModel("textLanguage", { required: true });

// rte-vue expects simple v-model, not v-model:text, so we need a computed wrapper
const editorContent = computed({
    get: () => text.value || "",
    set: (value: string) => {
        text.value = value;
    },
});

const showModal = ref(false);
const url = ref("");
const urlInput = ref<InstanceType<typeof LInput>>();
type RteWithEditor = InstanceType<typeof RTextEditor> & {
    editor?: {
        chain: () => {
            focus: () => {
                extendMarkRange: (mark: string) => {
                    setLink: (attrs: { href: string }) => { run: () => void };
                };
            };
        };
    };
};
const rteRef = ref<RteWithEditor>();

const iconMap: Record<string, any> = {
    bold: BoldIcon,
    italic: ItalicIcon,
    strike: StrikethroughIcon,
    bulletList: BulletlistIcon,
    orderedList: NumberedListIcon,
};

function openLinkModal() {
    url.value = "";
    showModal.value = true;
}

function addLink() {
    if (url.value) {
        rteRef.value?.editor
            ?.chain()
            .focus()
            .extendMarkRange("link")
            .toggleLink({ href: url.value })
            .run();
    }
    showModal.value = false;
}

// Focus the URL input when modal opens
watch(showModal, async () => {
    if (showModal.value) {
        await nextTick();
        urlInput.value?.focus();
    }
});
</script>

<template>
    <div :class="$attrs.class" class="-mx-4 flex h-full min-h-0 flex-col px-4">
        <div class="flex items-center gap-2">
            <component v-if="props.icon" :is="props.icon" class="h-6 w-6 text-zinc-600" />
            <FormLabel v-if="props.title" :icon="props.icon">{{ title }}</FormLabel>
        </div>
        <RTextEditor
            ref="rteRef"
            v-model="editorContent"
            class="h-full min-h-0 flex-1"
            :key="String(textLanguage)"
            :disabled="props.disabled"
            :transformPastedHtml="formatPastedHtml"
            :headingOffset="1"
            :contentFormat="'json'"
            :toolbarGroups="[
                ['bold', 'italic', 'strike'],
                ['heading1', 'heading2', 'heading3', 'heading4'],
                ['bulletList', 'orderedList'],
                ['link', 'unlink'],
            ]"
            @request-link="openLinkModal"
            :classNames="{
                root: 'flex flex-1 flex-col',
                toolbar: 'flex flex-wrap gap-4 pb-2',
                toolbarGroup: 'flex',
                button: 'bg-zinc-100 px-2 py-1.5 hover:bg-zinc-200 active:bg-zinc-300',
                buttonActive: 'bg-zinc-300',
                editor: 'prose flex flex-col h-full sm:min-h-[calc(100vh-10rem)] min-h-[calc(100vh-20rem)] max-h-[calc(100vh-20rem)] sm:max-h-[calc(100vh-10rem)] p-1 w-full overflow-y-auto prose-zinc lg:prose-sm max-w-none ring-1 ring-inset border-0 focus-within:ring-2 focus-within:ring-inset focus:outline-none rounded-md ring-zinc-300 hover:ring-zinc-400 focus-within:ring-zinc-950',
                editorContent: 'flex-1 h-full outline-none',
            }"
        >
            <template #toolbar-button="{ item, label, active, disabled: btnDisabled, runCommand }">
                <button
                    :class="[
                        'bg-zinc-100 px-2 py-1.5 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': active },
                        {
                            'rounded-l-md':
                                item === 'bold' ||
                                item === 'heading1' ||
                                item === 'bulletList' ||
                                item === 'link',
                        },
                        {
                            'rounded-r-md':
                                item === 'strike' ||
                                item === 'heading4' ||
                                item === 'orderedList' ||
                                item === 'unlink',
                        },
                    ]"
                    :disabled="btnDisabled"
                    @click="runCommand(item)"
                    type="button"
                >
                    <component v-if="iconMap[item]" :is="iconMap[item]" class="h-5 w-5" />
                    <span v-else class="text-sm font-medium">{{ label }}</span>
                </button>
            </template>
        </RTextEditor>
    </div>
    <LModal
        v-model:isVisible="showModal"
        heading="Add Link"
        @keydown.esc="showModal = false"
        @keydown.enter="addLink"
    >
        <LInput
            ref="urlInput"
            v-model="url"
            label="URL"
            name="url"
            placeholder="https://example.com"
            type="text"
            class="mb-4"
            :disabled="props.disabled"
        />

        <template #footer>
            <div class="flex justify-end gap-2">
                <LButton
                    :disabled="!url"
                    @click="addLink"
                    variant="primary"
                    class="w-20"
                    type="button"
                    >Ok</LButton
                >
                <LButton @click="showModal = false" class="w-20" variant="secondary" type="button"
                    >Cancel</LButton
                >
            </div>
        </template>
    </LModal>
</template>

<style scoped>
.ProseMirror h5 {
    font-size: 0.83em !important;
    font-weight: 600 !important;
    margin: 0.5rem 0 !important;
    line-height: 1.3 !important;
}

.ProseMirror > :first-child {
    margin-top: 0;
}
</style>
