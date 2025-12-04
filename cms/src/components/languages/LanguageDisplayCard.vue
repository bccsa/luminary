<script setup lang="ts">
import DisplayCard from "@/components/common/DisplayCard.vue";
import { db, type LanguageDto } from "luminary-shared";
import LBadge from "@/components/common/LBadge.vue";
import { DateTime } from "luxon";
import { ClockIcon } from "@heroicons/vue/24/outline";
import { isMobileScreen } from "@/globalConfig";

type Props = {
    languagesDoc: LanguageDto;
};
const props = defineProps<Props>();
const isLocalChanges = db.isLocalChangeAsRef(props.languagesDoc._id);
</script>

<template>
    <div class="mt-1 flex flex-col">
        <DisplayCard
            title=""
            :updatedTimeUtc="0"
            class="!divide-y-0 !py-0"
            @click="$router.push({ name: 'language', params: { id: languagesDoc._id } })"
        >
            <template #content>
                <div class="flex justify-between pb-3 min-[1500px]:pt-2">
                    <div>
                        <span>
                            <span class="font-medium text-zinc-700">
                                <LBadge>{{ languagesDoc.languageCode.toLocaleUpperCase() }}</LBadge>
                            </span>
                            <span class="pl-1 text-sm font-medium text-zinc-900">{{
                                languagesDoc.name
                            }}</span>
                            <span class="ml-4 font-medium text-zinc-900">
                                <LBadge v-if="languagesDoc.default" variant="success">
                                    Default
                                </LBadge>
                            </span>
                        </span>
                    </div>
                    <div class="flex">
                        <span class="font-medium text-zinc-900">
                            <LBadge v-if="isLocalChanges" variant="warning" class="mr-3">
                                Offline changes
                            </LBadge></span
                        >
                        <div class="flex items-center justify-end text-sm text-zinc-500">
                            <ClockIcon
                                class="mr-[3px] h-4 w-4 text-zinc-400 max-lg:h-4 max-lg:w-4"
                            />
                            <span title="Last Updated">{{
                                db
                                    .toDateTime(languagesDoc.updatedTimeUtc)
                                    .toLocaleString(
                                        isMobileScreen
                                            ? DateTime.DATE_SHORT
                                            : DateTime.DATETIME_SHORT,
                                    )
                            }}</span>
                        </div>
                    </div>
                </div>
            </template>
        </DisplayCard>
    </div>
</template>
