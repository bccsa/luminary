<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ImageFileCollectionDto } from "luminary-shared";
import LButton from "@/components/button/LButton.vue";
import LModal from "@/components/modals/LModal.vue";
import LSelect from "@/components/forms/LSelect.vue";
import { renderVertical } from "@/util/verticalImage/renderVertical";
import type { VerticalPlan, VerticalStrategy } from "@/util/verticalImage/planVertical";

type Props = {
    fileCollections: ImageFileCollectionDto[];
    bucketUrl?: string;
};
const props = defineProps<Props>();

// The widest collection is the original landscape photo; an editor-uploaded portrait version
// would only be cropped further.
const sourceFile = computed(() => {
    const collection = [...props.fileCollections].sort((a, b) => b.aspectRatio - a.aspectRatio)[0];
    return collection?.imageFiles.reduce(
        (widest, file) => (file.width > widest.width ? file : widest),
        collection.imageFiles[0],
    );
});
const sourceUrl = computed(() =>
    props.bucketUrl && sourceFile.value?.filename
        ? `${props.bucketUrl.replace(/\/$/, "")}/${sourceFile.value.filename}`
        : undefined,
);

const strategyOptions = [
    { label: "Automatic", value: "auto" },
    { label: "Crop", value: "crop" },
    { label: "Blur fill", value: "blur-fill" },
];

const isOpen = ref(false);
const strategy = ref<"auto" | VerticalStrategy>("auto");
const loading = ref(false);
const error = ref<string>();
const resultUrl = ref<string>();
const plan = ref<VerticalPlan>();

let sourceBlob: { url: string; blob: Blob } | undefined;

const loadSource = async (url: string) => {
    if (sourceBlob?.url === url) return sourceBlob.blob;
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`The bucket answered ${response.status}`);
    sourceBlob = { url, blob: await response.blob() };
    return sourceBlob.blob;
};

const setResult = (url?: string) => {
    if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
    resultUrl.value = url;
};

const generate = async () => {
    if (!sourceUrl.value) return;
    loading.value = true;
    error.value = undefined;
    try {
        const result = await renderVertical(await loadSource(sourceUrl.value), {
            strategy: strategy.value,
        });
        plan.value = result.plan;
        setResult(URL.createObjectURL(result.blob));
    } catch (e) {
        // A fetch that fails outright is almost always the bucket not allowing CORS from the CMS.
        error.value =
            e instanceof TypeError
                ? "Could not load the image from the storage bucket. Check that the bucket allows CORS requests from the CMS."
                : `Could not create the vertical image: ${(e as Error).message}`;
        setResult(undefined);
    } finally {
        loading.value = false;
    }
};

const open = () => {
    isOpen.value = true;
    generate();
};

watch(strategy, () => {
    if (isOpen.value) generate();
});

const downloadName = computed(() => {
    const base = sourceFile.value?.filename?.replace(/\.[^.]+$/, "") ?? "image";
    return `${base}-vertical-3x4.webp`;
});

onBeforeUnmount(() => setResult(undefined));
</script>

<template>
    <div v-if="sourceUrl">
        <LButton variant="secondary" size="sm" data-test="vertical-preview-open" @click="open">
            Preview vertical (3:4)
        </LButton>

        <LModal v-model:isVisible="isOpen" heading="Vertical image preview (3:4)" wide>
            <div class="flex flex-col gap-4 py-2">
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                    Preview only: the vertical image is created in your browser and is not saved.
                </p>

                <LSelect v-model="strategy" :options="strategyOptions" label="Method" size="sm" />

                <p
                    v-if="error"
                    class="text-sm text-red-600 dark:text-red-400"
                    data-test="vertical-preview-error"
                >
                    {{ error }}
                </p>

                <div class="flex flex-col items-start gap-4 sm:flex-row">
                    <figure class="flex-1">
                        <img :src="sourceUrl" class="w-full rounded shadow" alt="Original image" />
                        <figcaption class="mt-1 text-xs text-zinc-500">Original</figcaption>
                    </figure>
                    <figure class="w-48 shrink-0">
                        <div
                            class="flex aspect-[3/4] w-full items-center justify-center rounded bg-zinc-100 shadow dark:bg-slate-800"
                        >
                            <span v-if="loading" class="text-xs text-zinc-500">Creating…</span>
                            <img
                                v-else-if="resultUrl"
                                :src="resultUrl"
                                class="h-full w-full rounded"
                                alt="Vertical image"
                                data-test="vertical-preview-result"
                            />
                        </div>
                        <figcaption v-if="plan && !loading" class="mt-1 text-xs text-zinc-500">
                            {{ plan.strategy === "crop" ? "Cropped" : "Blur fill" }} ·
                            {{ plan.width }}×{{ plan.height }}
                        </figcaption>
                    </figure>
                </div>
            </div>

            <template #footer>
                <LButton
                    v-if="resultUrl && !loading"
                    is="a"
                    :href="resultUrl"
                    :download="downloadName"
                    variant="primary"
                    data-test="vertical-preview-download"
                >
                    Download
                </LButton>
            </template>
        </LModal>
    </div>
</template>
