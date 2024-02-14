<script setup lang="ts">
import AcInput from "@/components/forms/AcInput.vue";
import AcTextarea from "@/components/forms/AcTextarea.vue";
import AcButton from "@/components/button/AcButton.vue";
import AcBadge from "@/components/common/AcBadge.vue";
import AcCard from "@/components/common/AcCard.vue";
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
            <AcCard title="Basic translation settings" collapsible>
                <AcButton>Set custom image</AcButton>

                <AcInput label="Title" class="mt-6" required />

                <AcTextarea label="Summary" class="mt-4" />

                <div class="mt-4 flex gap-4">
                    <AcInput label="Publish date" class="w-1/2" type="date">
                        This is the date that will be shown on the post
                    </AcInput>
                    <AcInput label="Expiry date" class="w-1/2" type="date">
                        When set, this translation will automatically be hidden on this date. Not
                        visible in the app
                    </AcInput>
                </div>
            </AcCard>

            <AcCard title="Text content" :icon="DocumentTextIcon" collapsible>
                <AcTextarea rows="8" />
            </AcCard>

            <AcCard title="Video" :icon="VideoCameraIcon" collapsible>
                <AcInput
                    placeholder="videoTitle"
                    leftAddOn="https://cdn.bcc.africa/vod/"
                    rightAddOn="/playlist.m3u8"
                />
            </AcCard>

            <AcCard title="Audio" :icon="MusicalNoteIcon" collapsible>
                <AcInput
                    placeholder="audioTitle"
                    leftAddOn="https://cdn.bcc.africa/vod/"
                    rightAddOn="/playlist.m3u8"
                />
            </AcCard>
        </div>

        <div class="col-span-3 md:col-span-1">
            <div class="sticky top-20 space-y-6">
                <AcCard>
                    <div class="flex gap-4">
                        <AcButton>Save as draft</AcButton>
                        <AcButton variant="primary">Save & publish</AcButton>
                    </div>

                    <template #footer>
                        <AcBadge variant="warning">Not saved</AcBadge>
                        <span class="ml-1 text-xs text-gray-700">
                            Save this post to be able to add more languages
                        </span>
                    </template>
                </AcCard>

                <AcCard title="Preview">
                    <div class="flex gap-4">
                        <AcButton>Preview changes</AcButton>
                        <AcButton :icon="ArrowTopRightOnSquareIcon" iconRight>Open link</AcButton>
                    </div>
                </AcCard>

                <AcCard
                    title="Post settings"
                    :icon="Cog6ToothIcon"
                    class="sticky top-20"
                    collapsible
                >
                    <AcInput
                        label="Default image"
                        placeholder="cdn.bcc.africa/img/image.png"
                        leftAddOn="https://"
                    >
                        This image can be overridden in a translation
                    </AcInput>

                    <AcInput
                        label="Categories"
                        placeholder="Begin typing to select one..."
                        class="mt-4"
                    />
                    <AcInput
                        label="Topics"
                        placeholder="Begin typing to select one..."
                        class="mt-4"
                    />
                    <AcInput
                        label="Audio playlists"
                        placeholder="Begin typing to select one..."
                        class="mt-4"
                    />
                </AcCard>
            </div>
        </div>
    </div>
</template>
