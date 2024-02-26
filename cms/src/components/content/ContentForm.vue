<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LTextarea from "@/components/forms/LTextarea.vue";
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
import { computed, onMounted } from "vue";

type Props = {
    content: Content;
    post?: Post;
};

const props = defineProps<Props>();

const emit = defineEmits(["save"]);

const validationSchema = toTypedSchema(
    yup.object({
        parent: yup.object({
            image: yup.string().required(),
        }),
        title: yup.string().required(),
        summary: yup.string(),
    }),
);

const { handleSubmit, meta, setValues } = useForm({
    validationSchema,
});

onMounted(() => {
    setValues({
        parent: props.post,
    });

    setValues(props.content);
});

const saveAndPublish = handleSubmit(async (values) => {
    const content: Content = {
        ...props.content,
        ...values,
        status: ContentStatus.Published,
    };

    const post = {
        ...props.post,
        ...values.parent,
    };

    emit("save", content, post);
});
const saveAsDraft = handleSubmit(async (values) => {
    const content: Content = {
        ...props.content,
        ...values,
        status: ContentStatus.Draft,
    };

    const post = {
        ...props.post,
        ...values.parent,
    };

    console.log(content, post);

    emit("save", content, post);
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
                    <LInput name="publishDate" label="Publish date" class="w-1/2" type="date">
                        This is the date that will be shown on the post
                    </LInput>
                    <LInput name="expiryDate" label="Expiry date" class="w-1/2" type="date">
                        When set, this translation will automatically be hidden on this date. Not
                        visible in the app
                    </LInput>
                </div>
            </LCard>

            <LCard title="Text content" :icon="DocumentTextIcon" collapsible>
                <LTextarea rows="8" />
            </LCard>

            <LCard title="Video" :icon="VideoCameraIcon" collapsible>
                <LInput
                    name="video"
                    placeholder="videoTitle"
                    leftAddOn="https://cdn.bcc.africa/vod/"
                    rightAddOn="/playlist.m3u8"
                />
            </LCard>

            <LCard title="Audio" :icon="MusicalNoteIcon" collapsible>
                <LInput
                    name="audio"
                    placeholder="audioTitle"
                    leftAddOn="https://cdn.bcc.africa/vod/"
                    rightAddOn="/playlist.m3u8"
                />
            </LCard>
        </div>

        <div class="col-span-3 md:col-span-1">
            <div class="sticky top-20 space-y-6">
                <LCard>
                    <div class="flex gap-4">
                        <LButton @click="saveAsDraft">Save as draft</LButton>
                        <LButton variant="primary" @click="saveAndPublish">Save & publish</LButton>
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
                            <div v-if="!meta.valid">Form not valid</div>
                        </template>
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
@/components/button/LButton.vue
