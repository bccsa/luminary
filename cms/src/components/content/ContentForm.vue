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
import { ref, toRaw, toRefs, watch } from "vue";
import { onlyAllowedKeys } from "@/util/onlyAllowedKeys";
import { DateTime } from "luxon";

type Props = {
    content: Content;
    post?: Post;
};

const props = defineProps<Props>();

const { content: contentProp, post: postProp } = toRefs(props);

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
        publishDate: yup.date().optional(),
        text: yup.string().optional(),
        audio: yup.string().optional(),
        video: yup.string().optional(),
    }),
);

const { handleSubmit, meta, values, setValues } = useForm({
    validationSchema,
});

watch(
    [postProp, contentProp],
    ([post, content]) => {
        // Convert dates to format VeeValidate understands
        const filteredContent: any = { ...content };
        filteredContent.publishDate = content.publishDate?.toISO()?.split(".")[0];

        setValues({
            ...onlyAllowedKeys(filteredContent, Object.keys(values)),
            parent: onlyAllowedKeys(post, Object.keys(values.parent as object)),
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

    return emit("save", content, post);
};

const saveAndPublish = handleSubmit(async (validatedFormValues) => {
    return save(validatedFormValues, ContentStatus.Published);
});
const saveAsDraft = handleSubmit(async (validatedFormValues) => {
    return save(validatedFormValues, ContentStatus.Draft);
});
</script>

<template>
    <div class="relative grid grid-cols-3 gap-8">
        <div class="col-span-3 space-y-6 md:col-span-2">
            <LCard title="Basic translation settings" collapsible>
                <LButton>Set custom image</LButton>

                <LInput name="title" label="Title" class="mt-6" required />

                <LInput name="summary" label="Summary" class="mt-4" />

                <div class="mt-4 flex gap-4">
                    <LInput
                        name="publishDate"
                        label="Publish date"
                        class="w-1/2"
                        type="datetime-local"
                    >
                        Only used for display, does not automatically publish at this date
                    </LInput>
                </div>
            </LCard>

            <LButton
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
                        <LButton @click="saveAsDraft" data-test="draft">Save as draft</LButton>
                        <LButton variant="primary" @click="saveAndPublish" data-test="publish">
                            Save & publish
                        </LButton>
                    </div>

                    <template #footer>
                        <template v-if="content.status == ContentStatus.Published">
                            <LBadge variant="success">Published</LBadge>
                            <span class="ml-1 text-xs text-gray-700"> ... </span>
                        </template>
                        <template v-else>
                            <LBadge variant="info">Draft</LBadge>
                            <span class="ml-1 text-xs text-gray-700">
                                Fill in these fields to be able to publish:
                            </span>
                        </template>
                        <div v-if="!meta.valid">Form not valid</div>
                    </template>
                </LCard>

                <LCard title="Preview">
                    <div class="flex gap-4">
                        <LButton>Preview changes</LButton>
                        <LButton :icon="ArrowTopRightOnSquareIcon" iconRight>Open link</LButton>
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
    </div>
</template>
