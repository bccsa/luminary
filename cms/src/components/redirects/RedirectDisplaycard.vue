<script setup lang="ts">
import DisplayCard from "../common/DisplayCard.vue";
import LBadge from "../common/LBadge.vue";
import { UserGroupIcon } from "@heroicons/vue/20/solid";
import {
    db,
    DocType,
    AclPermission,
    verifyAccess,
    type RedirectDto,
    type GroupDto,
} from "luminary-shared";
import { computed, ref } from "vue";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";

type Props = {
    redirectDoc: RedirectDto;
};

const props = defineProps<Props>();
const isLocalChanges = db.isLocalChangeAsRef(props.redirectDoc._id);
const isModalVisible = ref(false);

const availableGroups = db.whereTypeAsRef<GroupDto[]>(DocType.Group, []);
const redirectGroups = computed(() =>
    availableGroups.value?.filter(
        (g) =>
            props.redirectDoc.memberOf.includes(g._id) &&
            verifyAccess([g._id], DocType.Group, AclPermission.View, "any"),
    ),
);
</script>

<template>
    <DisplayCard
        :title="redirectDoc.slug"
        :updated-time-utc="redirectDoc.updatedTimeUtc"
        @click="isModalVisible = true"
        class="mb-1"
    >
        <template #content>
            <div class="flex justify-between pb-1 min-[1500px]:pt-0">
                <div>
                    <span class="text-xs text-zinc-500 sm:text-sm">
                        {{ redirectDoc.toSlug ?? "HOMEPAGE" }}
                    </span>
                </div>
            </div>
        </template>

        <template #topRightContent>
            <div class="flex gap-1">
                <LBadge v-if="isLocalChanges" variant="warning" class="whitespace-nowrap"
                    >Offline changes</LBadge
                >
                <LBadge>{{ redirectDoc.redirectType.toLocaleUpperCase() }}</LBadge>
            </div>
        </template>

        <template #mobileFooter>
            <div class="flex flex-1 items-center gap-1">
                <div>
                    <UserGroupIcon class="size-4 text-zinc-400" />
                </div>
                <div class="flex flex-wrap gap-1">
                    <LBadge
                        v-for="group in redirectGroups"
                        :key="group._id"
                        type="default"
                        variant="blue"
                    >
                        {{ group.name }}
                    </LBadge>
                    <span v-if="redirectGroups.length === 0" class="text-xs text-zinc-400">
                        No groups
                    </span>
                </div>
            </div>
        </template>

        <template #desktopFooter>
            <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                <UserGroupIcon class="size-4 text-zinc-400" />
                <LBadge
                    v-for="group in redirectGroups"
                    :key="group._id"
                    type="default"
                    variant="blue"
                >
                    {{ group.name }}
                </LBadge>
                <span v-if="redirectGroups.length === 0" class="text-xs text-zinc-400">
                    No groups
                </span>
            </div>
        </template>
    </DisplayCard>

    <CreateOrEditRedirectModal
        v-if="isModalVisible"
        :isVisible="isModalVisible"
        :redirect="redirectDoc"
        @close="isModalVisible = false"
    />
</template>
