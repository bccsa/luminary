<script setup lang="ts">
import AcInput from "@/components/forms/AcInput.vue";
import AcTextarea from "@/components/forms/AcTextarea.vue";
import AcButton from "@/components/button/AcButton.vue";
import AcBadge from "@/components/common/AcBadge.vue";
import AcCard from "@/components/common/AcCard.vue";
import AcTabs from "@/components/common/AcTabs.vue";
import {
    Cog6ToothIcon,
    DocumentTextIcon,
    VideoCameraIcon,
    MusicalNoteIcon,
} from "@heroicons/vue/20/solid";
import BleedHorizontal from "@/components/BleedHorizontal.vue";
import { ref } from "vue";

type Props = {
    type: "post" | "tag";
};

defineProps<Props>();

const tabs = [
    {
        title: "English",
        key: "eng",
    },
];
const currentTab = ref("eng");
</script>

<template>
    <div class="relative grid grid-cols-3 gap-8">
        <div class="col-span-3 md:col-span-2">
            <BleedHorizontal class="sticky top-16 z-10 bg-gray-50">
                <AcTabs :tabs="tabs" v-model:currentTab="currentTab" />
            </BleedHorizontal>

            <AcCard class="my-6">
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

            <AcCard>
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

            <AcCard title="Text content" :icon="DocumentTextIcon" class="mt-6">
                <AcTextarea rows="8" />
            </AcCard>

            <AcCard title="Video" :icon="VideoCameraIcon" class="mt-6">
                <AcInput
                    placeholder="videoTitle"
                    leftAddOn="https://cdn.bcc.africa/vod/"
                    rightAddOn="/playlist.m3u8"
                />
            </AcCard>

            <AcCard title="Audio" :icon="MusicalNoteIcon" class="mt-6">
                <AcInput
                    placeholder="audioTitle"
                    leftAddOn="https://cdn.bcc.africa/vod/"
                    rightAddOn="/playlist.m3u8"
                />
            </AcCard>
        </div>

        <div class="col-span-3 md:col-span-1">
            <AcCard title="Post settings" :icon="Cog6ToothIcon" class="sticky top-20" subdued>
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
                <AcInput label="Topics" placeholder="Begin typing to select one..." class="mt-4" />
                <AcInput
                    label="Audio playlists"
                    placeholder="Begin typing to select one..."
                    class="mt-4"
                />
            </AcCard>
        </div>
    </div>
</template>
