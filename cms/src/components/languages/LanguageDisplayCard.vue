<script setup lang="ts">
import DisplayCard from "@/components/common/DisplayCard.vue";
import { db, type LanguageDto } from "luminary-shared";
import LBadge from "@/components/common/LBadge.vue";
import { DateTime } from "luxon";
import { ClockIcon } from "@heroicons/vue/24/outline";

type Props = {
    languagesDoc: LanguageDto;
};
const props = defineProps<Props>();
const isLocalChanges = db.isLocalChangeAsRef(props.languagesDoc._id);
</script>

<template>
    <div class="flex flex-col pt-1">
        <DisplayCard
            title=""
            :updatedTimeUtc="0"
            class="!divide-y-0"
            @click="$router.push({ name: 'language', params: { id: languagesDoc._id } })"
        >
            <template #content>
                <div class="flex justify-between pb-2">
                    <div>
                        <span>
                            <span class="font-medium text-zinc-700">
                                <LBadge>{{ languagesDoc.languageCode.toLocaleUpperCase() }}</LBadge>
                            </span>
                            <span class="text-l pl-1 font-medium text-zinc-900">{{
                                languagesDoc.name
                            }}</span>
                        </span>
                    </div>
                    <div class="font-medium text-zinc-900">
                        <LBadge v-if="languagesDoc.default" variant="success">Default</LBadge>
                    </div>
                    <div class="flex">
                        <span class="font-medium text-zinc-900">
                            <LBadge v-if="isLocalChanges" variant="warning" class="mr-3">
                                Offline changes
                            </LBadge></span
                        >
                        <div class="flex items-center justify-end text-zinc-500">
                            <ClockIcon class="mr-[3px] h-5 w-5 text-zinc-400" />
                            <span title="Last Updated">{{
                                db
                                    .toDateTime(languagesDoc.updatedTimeUtc)
                                    .toLocaleString(DateTime.DATETIME_SHORT)
                            }}</span>
                        </div>
                    </div>
                </div>
            </template>
        </DisplayCard>
    </div>
</template>
