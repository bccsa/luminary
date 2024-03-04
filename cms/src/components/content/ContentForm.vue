<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import LBadge from "@/components/common/LBadge.vue";
import LCard from "@/components/common/LCard.vue";
import {
    Cog6ToothIcon,
    DocumentTextIcon,
    VideoCameraIcon,
    MusicalNoteIcon,
    ArrowTopRightOnSquareIcon,
} from "@heroicons/vue/20/solid";
import { ContentStatus, type Content, type Post } from "@/types";
import { toTypedSchema } from "@vee-validate/yup";
import { useForm } from "vee-validate";
import * as yup from "yup";
import { computed, ref, toRaw, toRefs, watch } from "vue";
import { onlyAllowedKeys } from "@/util/onlyAllowedKeys";
import { DateTime } from "luxon";
import { renderErrorMessage } from "@/util/renderErrorMessage";
import { useLocalChangeStore } from "@/stores/localChanges";

type Props = {
    content: Content;
    post?: Post;
};

const props = defineProps<Props>();

const { content: contentProp, post: postProp } = toRefs(props);

const { isLocalChange } = useLocalChangeStore();

const hasText = ref(contentProp.value.text != undefined && contentProp.value.text.trim() != "");
const hasAudio = ref(contentProp.value.audio != undefined && contentProp.value.audio.trim() != "");
const hasVideo = ref(contentProp.value.video != undefined && contentProp.value.video.trim() != "");

const emit = defineEmits(["save"]);

const validationSchema = toTypedSchema(
    yup.object({
        parent: yup.object({
            image: yup.string().required(),
        }),
        title: yup.string().required(),
        summary: yup.string().optional(),
        publishDate: yup
            .date()
            .transform((value, _, context) => {
                // Check to see if the previous transform already parsed the date
                if (context.isType(value)) {
                    return value;
                }

                // Default validation failed, clear the field
                // This happens when the 'clear' button in the browser datepicker is used,
                // which sets the value to an empty string
                return undefined;
            })
            .optional(),
        text: yup.string().optional(),
        audio: yup.string().optional(),
        video: yup.string().optional(),
    }),
);

const { handleSubmit, values, setValues, errors } = useForm({
    validationSchema,
});
watch(
    [postProp, contentProp],
    ([post, content]) => {
        // Convert dates to format VeeValidate understands
        const filteredContent: any = { ...toRaw(content) };
        filteredContent.publishDate = content.publishDate?.toISO()?.split(".")[0];

        setValues({
            ...onlyAllowedKeys(filteredContent, Object.keys(values)),
            parent: onlyAllowedKeys(toRaw(post), Object.keys(values.parent as object)),
        });
    },
    { immediate: true },
);

const save = async (validatedFormValues: typeof values, status: ContentStatus) => {
    // Make sure we don't accidentally add the 'parent' object to the content
    const contentValues = { ...validatedFormValues };
    delete contentValues["parent"];
    let publishDate;
    if (contentValues.publishDate) {
        publishDate = DateTime.fromJSDate(contentValues.publishDate);
    }

    const content: Content = {
        ...toRaw(contentProp.value),
        ...contentValues,
        publishDate,
        status,
    };

    const post = {
        ...toRaw(postProp.value),
        image: validatedFormValues.parent?.image,
        // TODO create tags from topics etc.
    };

    isDirty.value = false;

    return emit("save", content, post);
};

const saveAndPublish = handleSubmit(async (validatedFormValues) => {
    return save(validatedFormValues, ContentStatus.Published);
});
const saveAsDraft = handleSubmit(async (validatedFormValues) => {
    return save(validatedFormValues, ContentStatus.Draft);
});

const canPublish = computed(() => {
    return (
        hasOneContentField.value && hasPublishDate.value && hasSummary.value && hasParentImage.value
    );
});
const hasOneContentField = computed(() => {
    return (
        (values.text != undefined && values.text?.trim() != "") ||
        (values.audio != undefined && values.audio?.trim() != "") ||
        (values.video != undefined && values.video?.trim() != "")
    );
});
const hasSummary = computed(() => {
    return values.summary != undefined && values.summary.trim() != "";
});
const hasPublishDate = computed(() => {
    return values.publishDate != undefined;
});
const hasParentImage = computed(() => {
    return values.parent?.image != undefined;
});

const isDirty = ref(false);
</script>

<template>
    <form
        type="post"
        class="relative grid grid-cols-3 gap-8"
        @submit.prevent
        @change="isDirty = true"
    >
        <div class="col-span-3 space-y-6 md:col-span-2">
            <LCard title="Basic translation settings" collapsible>
                <LInput name="title" label="Title" required />

                <LInput name="summary" label="Summary" class="mt-4" />

                <div class="mt-4 flex gap-4">
                    <LInput
                        name="publishDate"
                        label="Publish date"
                        class="w-1/2"
                        type="datetime-local"
                        @reset="(e) => console.log(e)"
                    >
                        Only used for display, does not automatically publish at this date
                    </LInput>
                </div>
            </LCard>

            <LButton
                type="button"
                variant="tertiary"
                :icon="DocumentTextIcon"
                @click="hasText = true"
                v-if="!hasText"
                data-test="addText"
            >
                Add text
            </LButton>
            <LCard title="Text content" :icon="DocumentTextIcon" collapsible v-show="hasText">
                <LInput name="text" />
            </LCard>

            <LButton
                type="button"
                variant="tertiary"
                :icon="VideoCameraIcon"
                @click="hasVideo = true"
                v-if="!hasVideo"
                data-test="addVideo"
            >
                Add Video
            </LButton>
            <LCard title="Video" :icon="VideoCameraIcon" collapsible v-show="hasVideo">
                <LInput name="video" leftAddOn="https://" />
            </LCard>

            <LButton
                type="button"
                variant="tertiary"
                :icon="MusicalNoteIcon"
                @click="hasAudio = true"
                v-if="!hasAudio"
                data-test="addAudio"
            >
                Add Audio
            </LButton>
            <LCard title="Audio" :icon="MusicalNoteIcon" collapsible v-show="hasAudio">
                <LInput name="audio" leftAddOn="https://" />
            </LCard>
        </div>

        <div class="col-span-3 md:col-span-1">
            <div class="sticky top-20 space-y-6">
                <LCard>
                    <div class="flex gap-4">
                        <LButton type="button" @click="saveAsDraft" data-test="draft">
                            Save as draft
                        </LButton>
                        <LButton
                            type="button"
                            variant="primary"
                            @click="saveAndPublish"
                            :disabled="!canPublish"
                            data-test="publish"
                        >
                            Save & publish
                        </LButton>
                    </div>

                    <template #footer>
                        <div class="flex flex-col gap-4 text-sm text-gray-700">
                            <div class="flex items-end justify-between">
                                <div>Status</div>
                                <div class="flex justify-end gap-2">
                                    <LBadge v-if="isDirty">Unsaved changes</LBadge>
                                    <LBadge
                                        v-else-if="isLocalChange(content._id)"
                                        variant="warning"
                                    >
                                        Offline changes
                                    </LBadge>

                                    <LBadge
                                        variant="success"
                                        v-if="content.status == ContentStatus.Published"
                                    >
                                        Published
                                    </LBadge>
                                    <LBadge variant="info" v-else>Draft</LBadge>
                                </div>
                            </div>
                        </div>

                        <template v-if="!canPublish">
                            <p class="mt-6 text-xs text-gray-700">
                                These fields prevent publishing:
                            </p>
                            <div class="mt-2 flex flex-col gap-2">
                                <div v-if="!hasOneContentField" class="ml-3 text-sm text-gray-900">
                                    - At least one of text, audio or video content is required
                                </div>
                                <div v-if="!hasSummary" class="ml-3 text-sm text-gray-900">
                                    - Summary is required
                                </div>
                                <div v-if="!hasPublishDate" class="ml-3 text-sm text-gray-900">
                                    - Publish date is required
                                </div>
                                <div
                                    v-for="(error, key) in errors"
                                    :key="key"
                                    class="ml-3 text-sm text-gray-900"
                                >
                                    - {{ renderErrorMessage(error) }}
                                </div>
                            </div>
                        </template>
                    </template>
                </LCard>

                <LCard title="Preview">
                    <div class="flex gap-4">
                        <LButton type="button">Preview changes</LButton>
                        <LButton type="button" :icon="ArrowTopRightOnSquareIcon" iconRight>
                            Open link
                        </LButton>
                    </div>
                </LCard>

                <LCard
                    title="Post settings"
                    :icon="Cog6ToothIcon"
                    class="sticky top-20"
                    collapsible
                >
                    <LInput
                        name="parent.image"
                        label="Default image"
                        placeholder="cdn.bcc.africa/img/image.png"
                        leftAddOn="https://"
                    >
                        This image can be overridden in a translation
                    </LInput>

                    <LInput
                        name="parent.categories"
                        label="Categories"
                        placeholder="Begin typing to select one..."
                        class="mt-4"
                    />
                    <LInput
                        name="parent.topics"
                        label="Topics"
                        placeholder="Begin typing to select one..."
                        class="mt-4"
                    />
                    <LInput
                        name="parent.audioPlaylists"
                        label="Audio playlists"
                        placeholder="Begin typing to select one..."
                        class="mt-4"
                    />
                </LCard>
            </div>
        </div>
    </form>
</template>
