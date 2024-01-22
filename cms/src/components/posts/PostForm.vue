<script setup lang="ts">
import AcInput from "@/components/forms/AcInput.vue";
import AcTextarea from "@/components/forms/AcTextarea.vue";
import AcButton from "@/components/button/AcButton.vue";
import AcCard from "@/components/AcCard.vue";
import AcTabs from "@/components/AcTabs.vue";
import {
    Cog6ToothIcon,
    DocumentTextIcon,
    VideoCameraIcon,
    MusicalNoteIcon,
} from "@heroicons/vue/20/solid";
import BleedHorizontal from "@/components/BleedHorizontal.vue";
</script>

<template>
    <div class="relative grid grid-cols-3 gap-8">
        <div class="col-span-3 md:col-span-2">
            <BleedHorizontal class="sticky top-16 z-10 bg-gray-50">
                <AcTabs />
            </BleedHorizontal>

            <AcCard class="my-6">
                <div class="flex gap-4">
                    <AcButton variant="secondary">Save as draft</AcButton>
                    <AcButton>Publish</AcButton>
                </div>
                <p class="mt-4">Status: not saved</p>
            </AcCard>

            <AcCard>
                <AcButton variant="secondary">Set custom image</AcButton>

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
            <AcCard title="Post Settings" :icon="Cog6ToothIcon" class="sticky top-20" subdued>
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
