<script setup lang="ts">
import DisplayCard from "../common/DisplayCard.vue";
import LBadge from "../common/LBadge.vue";
import { ClockIcon } from "@heroicons/vue/20/solid";
import { DateTime } from "luxon";
import { db, DocType, AclPermission, verifyAccess, type RedirectDto } from "luminary-shared";
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

type Props = {
    redirectDoc: RedirectDto
};

const props = defineProps<Props>();
const isLocalChanges = db.isLocalChangeAsRef(props.redirectDoc._id);

const breakpoints = useBreakpoints(breakpointsTailwind);
const smallerThanSm = breakpoints.smaller('sm');

</script>

<template>
    <DisplayCard
        :title="redirectDoc.slug"
        :updated-time-utc="redirectDoc.updatedTimeUtc"

    >
        <template #topRightContent>
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-zinc-900">
                            <LBadge v-if="isLocalChanges" variant="warning" class="mr-3">
                                Offline changes
                            </LBadge></span
                        >
                        <div
                            v-if="redirectDoc.updatedTimeUtc"
                                class="flex items-center gap-1 text-xs text-zinc-400"
                        >
                            <ClockIcon class="h-4 w-4 text-zinc-400 max-sm:h-3 max-sm:w-3" />
                            <span title="Last updated" class="whitespace-nowrap">
                                {{
                                    db
                                        .toDateTime(redirectDoc.updatedTimeUtc)
                                        .toLocaleString(
                                            smallerThanSm
                                                ? DateTime.DATE_SHORT
                                                : DateTime.DATETIME_SHORT,
                                        )
                                }}
                            </span>
                        </div>
                    </div>
        </template>

        <template #content>
            <div class="flex justify-between pb-1 min-[1500px]:pt-0">
                    <div>
                        <span class="text-xs text-zinc-500 sm:text-sm">
                            {{ redirectDoc.toSlug ?? "HOMEPAGE" }}
                        </span>
                    </div>

                </div>
        </template>

    </DisplayCard>
</template>