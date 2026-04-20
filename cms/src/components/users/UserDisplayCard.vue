<script setup lang="ts">
import DisplayCard from "@/components/common/DisplayCard.vue";
import {
    db,
    type UserDto,
    type GroupDto,
    type AuthProviderDto,
    DocType,
} from "luminary-shared";
import LBadge from "@/components/common/LBadge.vue";
import { DateTime } from "luxon";
import { UserGroupIcon, KeyIcon } from "@heroicons/vue/24/outline";
import { computed } from "vue";
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";

type Props = {
    usersDoc: UserDto;
};
const props = defineProps<Props>();
const isLocalChanges = db.isLocalChangeAsRef(props.usersDoc._id);

const groups = db.whereTypeAsRef<GroupDto[]>(DocType.Group);
const authProviders = db.whereTypeAsRef<AuthProviderDto[]>(DocType.AuthProvider);

const emit = defineEmits<{ (e: "edit", id: string): void }>();
const showEditModal = defineModel<boolean>();

const breakpoints = useBreakpoints(breakpointsTailwind);
const smallerThanSm = breakpoints.smaller("sm");

function editModalVisible() {
    showEditModal.value = true;
    emit("edit", props.usersDoc._id);
}

const userGroups = computed(() => {
    return groups.value?.filter((g) => props.usersDoc.memberOf.includes(g._id)) || [];
});

const userProvider = computed(() =>
    authProviders.value?.find((p) => p._id === props.usersDoc.providerId),
);
</script>

<template>
    <div class="mt-1 flex flex-col">
        <DisplayCard
            :title="usersDoc.name"
            :updatedTimeUtc="usersDoc.updatedTimeUtc"
            :showDate="!smallerThanSm"
            @click="editModalVisible"
        >
            <template #topRightContent>
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
                        <KeyIcon class="h-4 w-4 text-zinc-400 max-sm:h-3 max-sm:w-3" />
                        <span title="Last logged in" class="whitespace-nowrap">
                            {{
                                db
                                    .toDateTime(usersDoc.lastLogin)
                                    .toLocaleString(
                                        smallerThanSm
                                            ? DateTime.DATE_SHORT
                                            : DateTime.DATETIME_SHORT,
                                    )
                            }}
                        </span>
                    </div>
                    <div v-else class="whitespace-nowrap text-xs text-zinc-400">
                        Has not logged in yet
                    </div>
                </div>
            </template>
            <template #content>
                <div class="flex justify-between pb-1 min-[1500px]:pt-0">
                    <div>
                        <span class="text-xs text-zinc-500 sm:text-sm">{{ usersDoc.email }}</span>
                    </div>
                </div>
            </template>

            <template #mobileFooter>
                <div class="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <LBadge
                        v-if="userProvider"
                        type="default"
                        variant="default"
                        :icon="KeyIcon"
                        withIcon
                    >
                        {{ userProvider.label || userProvider.domain }}
                    </LBadge>
                    <div class="flex items-center gap-1">
                        <UserGroupIcon class="h-4 w-4 text-zinc-400" />
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
                </div>
            </template>

            <template #desktopFooter>
                <div class="flex w-full flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <LBadge
                        v-if="userProvider"
                        type="default"
                        variant="default"
                        :icon="KeyIcon"
                        withIcon
                    >
                        {{ userProvider.label || userProvider.domain }}
                    </LBadge>
                    <div class="flex flex-1 flex-wrap items-center gap-1">
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
                </div>
            </template>
        </DisplayCard>
    </div>
</template>
