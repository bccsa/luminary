<script setup lang="ts">
import DisplayCard from "@/components/common/DisplayCard.vue";
import { db, type UserDto, type GroupDto, DocType } from "luminary-shared";
import LBadge from "@/components/common/LBadge.vue";
import { DateTime } from "luxon";
import { UserGroupIcon, KeyIcon } from "@heroicons/vue/24/outline";
import { isMobileScreen } from "@/globalConfig";
import { ref, watch } from "vue";

type Props = {
    usersDoc: UserDto;
};
const props = defineProps<Props>();
const isLocalChanges = db.isLocalChangeAsRef(props.usersDoc._id);

const groups = db.whereTypeAsRef<GroupDto[]>(DocType.Group);
const userGroups = ref<GroupDto[]>([]);

watch(groups, (newGroups) => {
    userGroups.value = newGroups.filter((g) => props.usersDoc.memberOf.includes(g._id));
});
</script>

<template>
    <div class="mt-1 flex flex-col">
        <DisplayCard
            :title="usersDoc.name"
            :updatedTimeUtc="0"
            @click="$router.push({ name: 'user', params: { id: usersDoc._id } })"
        >
            <template #content>
                <div class="flex justify-between pb-1 min-[1500px]:pt-0">
                    <div>
                        <span class="text-xs text-zinc-500 sm:text-sm">{{
                            usersDoc.email
                        }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-zinc-900">
                            <LBadge v-if="isLocalChanges" variant="warning" class="mr-3">
                                Offline changes
                            </LBadge></span
                        >
                        <div
                            v-if="usersDoc.lastLogin"
                            class="flex items-center gap-1 text-xs text-zinc-400"
                        >
                            <KeyIcon class="h-4 w-4 text-zinc-400" />
                            <span title="Last logged in"><span v-if="!isMobileScreen">Last logged in:</span>
                                {{
                                    db
                                        .toDateTime(usersDoc.lastLogin)
                                        .toLocaleString(
                                            isMobileScreen
                                                ? DateTime.DATE_SHORT
                                                : DateTime.DATETIME_SHORT,
                                        )
                                }}</span
                            >
                        </div>
                        <div v-else class="text-xs text-zinc-400">Has not logged in yet</div>
                    </div>
                </div>
            </template>

            <template #mobileFooter>
                <div class="flex flex-1 items-center gap-1">
                    <div>
                        <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                    </div>
                    <div class="flex flex-wrap gap-1">
                        <LBadge
                            v-for="group in userGroups"
                            :key="group._id"
                            type="default"
                            variant="blue"
                        >
                            {{ group.name }}
                        </LBadge>
                        <span v-if="userGroups.length === 0" class="text-xs text-zinc-400">
                            No groups
                        </span>
                    </div>
                </div>
            </template>

            <template #desktopFooter>
                <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                    <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                    <LBadge
                        v-for="group in userGroups"
                        :key="group._id"
                        type="default"
                        variant="blue"
                    >
                        {{ group.name }}
                    </LBadge>
                    <span v-if="userGroups.length === 0" class="text-xs text-zinc-400">
                        No groups
                    </span>
                </div>
            </template>
        </DisplayCard>
    </div>
</template>
