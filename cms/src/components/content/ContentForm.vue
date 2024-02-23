<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LTextarea from "@/components/forms/LTextarea.vue";
import AcButton from "@/components/button/AcButton.vue";
import LBadge from "@/components/common/LBadge.vue";
import LCard from "@/components/common/LCard.vue";
import {
    Cog6ToothIcon,
    DocumentTextIcon,
    VideoCameraIcon,
    MusicalNoteIcon,
    ArrowTopRightOnSquareIcon,
} from "@heroicons/vue/20/solid";

type Props = {
    type: "post" | "tag";
};

defineProps<Props>();
</script>

<template>
    <div class="relative grid grid-cols-3 gap-8">
        <div class="col-span-3 space-y-6 md:col-span-2">
            <LCard title="Basic translation settings" collapsible>
                <AcButton>Set custom image</AcButton>

                <LInput name="title" label="Title" class="mt-6" required />

                <LTextarea label="Summary" class="mt-4" />

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
                        <AcButton>Save as draft</AcButton>
                        <AcButton variant="primary">Save & publish</AcButton>
                    </div>

                    <template #footer>
                        <LBadge variant="warning">Not saved</LBadge>
                        <span class="ml-1 text-xs text-gray-700">
                            Save this post to be able to add more languages
                        </span>
                    </template>
                </LCard>

                <LCard title="Preview">
                    <div class="flex gap-4">
                        <AcButton>Preview changes</AcButton>
                        <AcButton :icon="ArrowTopRightOnSquareIcon" iconRight>Open link</AcButton>
                    </div>
                </LCard>

                <LCard
                    title="Post settings"
                    :icon="Cog6ToothIcon"
                    class="sticky top-20"
                    collapsible
                >
                    <LInput
                        name="image"
                        label="Default image"
                        placeholder="cdn.bcc.africa/img/image.png"
                        leftAddOn="https://"
                    >
                        This image can be overridden in a translation
                    </LInput>

                    <LInput
                        name="categories"
                        label="Categories"
                        placeholder="Begin typing to select one..."
                        class="mt-4"
                    />
                    <LInput
                        name="topics"
                        label="Topics"
                        placeholder="Begin typing to select one..."
                        class="mt-4"
                    />
                    <LInput
                        name="audio"
                        label="Audio playlists"
                        placeholder="Begin typing to select one..."
                        class="mt-4"
                    />
                </LCard>
            </div>
        </div>
    </div>
</template>
