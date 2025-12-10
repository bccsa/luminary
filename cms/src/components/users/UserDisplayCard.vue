<script setup lang="ts">
import DisplayCard from "@/components/common/DisplayCard.vue";
import { db, type UserDto, type GroupDto, DocType } from "luminary-shared";
import LBadge from "@/components/common/LBadge.vue";
import { DateTime } from "luxon";
import { ClockIcon, UserGroupIcon } from "@heroicons/vue/24/outline";
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
            :updatedTimeUtc="usersDoc.updatedTimeUtc || 0"
            class="!divide-y-0 !py-0"
            @click="$router.push({ name: 'user', params: { id: usersDoc._id } })"
        >
            <template #content>
                <div class="flex justify-between min-[1500px]:pt-2">
                    <div>
                        <span>
                            <span class="text-xs text-zinc-500 sm:text-sm">{{
                                usersDoc.email
                            }}</span>
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
                                v-if="usersDoc.lastLogin"
                                class="mr-[3px] h-4 w-4 text-zinc-400 max-lg:h-4 max-lg:w-4"
                            />
                            <span>
                                <span v-if="usersDoc.lastLogin" class="mr-1 text-zinc-400"
                                    >Last logged in:</span
                                >
                                {{
                                    usersDoc.lastLogin
                                        ? db
                                              .toDateTime(usersDoc.lastLogin)
                                              .toLocaleString(
                                                  isMobileScreen
                                                      ? DateTime.DATE_SHORT
                                                      : DateTime.DATETIME_SHORT,
                                              )
                                        : "Has not logged in yet"
                                }}
                            </span>
                        </div>
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
