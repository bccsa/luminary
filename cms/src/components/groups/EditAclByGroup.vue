<script setup lang="ts">
import { toRaw, computed, ref, onMounted } from "vue";
import EditAclEntry from "./EditAclEntry.vue";
import DuplicateGroupAclButton from "./DuplicateGroupAclButton.vue";
import { type GroupDto, AclPermission, type GroupAclEntryDto } from "luminary-shared";
import { capitaliseFirstLetter, getTheFirstLetter } from "@/util/string";
import { validDocTypes, isPermissionAvailable } from "./permissions";
import _ from "lodash";
import { isMobileScreen } from "@/globalConfig";
import DisplayCard from "@/components/common/DisplayCard.vue";
import LModal from "../modals/LModal.vue";
import LButton from "@/components/button/LButton.vue";
import LDropdown from "@/components/common/LDropdown.vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon } from "@heroicons/vue/24/outline";

type Props = {
    /**
     * Assigned group by which this component should filter and display / edit ACL entries
     */
    assignedGroup: GroupDto;
    /**
     * Original data from database for visual marking of changes
     */
    originalGroup: GroupDto;
    /**
     * List of available groups to duplicate ACL entries from
     */
    availableGroups: GroupDto[];
    disabled: boolean;
};
const props = defineProps<Props>();
const group = defineModel<GroupDto>("group");

const duplicateGroup = (targetGroup: GroupDto) => {
    group.value?.acl.push(
        ..._.cloneDeep(toRaw(group.value.acl))
            .filter((a) => a.groupId == props.assignedGroup._id)
            .map((a) => ({
                ...a,
                groupId: targetGroup._id,
            })),
    );
};

const removeAssignedGroup = () => {
    if (!group.value) return;
    group.value.acl = group.value.acl.filter(
        (a: GroupAclEntryDto) => a.groupId !== props.assignedGroup._id,
    );
};

const isVisible = ref(false);

const visibleAclEntries = computed(() => {
    return (
        group.value?.acl
            .filter((g) => g.groupId == props.assignedGroup._id && validDocTypes.includes(g.type))
            .sort((a, b) => {
                if (a.type < b.type) return -1;
                if (a.type > b.type) return 1;
                return 0;
            }) || []
    );
});

const showSelector = ref(false);

const typesWithActivePermissions = computed(() => {
    return visibleAclEntries.value
        .filter((aclEntry) => aclEntry.permission.length > 0)
        .map((aclEntry) => aclEntry.type);
});

const activeAclEntries = computed(() => {
    return visibleAclEntries.value.filter((aclEntry) => aclEntry.permission.length > 0);
});

const toggleAclEntry = (aclEntry: any) => {
    if (aclEntry.permission.length > 0) {
        aclEntry.permission = [];
    } else {
        aclEntry.permission.push(AclPermission.View);
    }
};

const activePermissions = (aclEntry: GroupAclEntryDto): AclPermission[] => {
    if (!aclEntry) return [];
    return Object.values(AclPermission).filter(
        (p) => isPermissionAvailable.value(aclEntry.type, p) && aclEntry.permission.includes(p),
    );
};

const scrollContainer = ref(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

const checkScroll = () => {
    if (scrollContainer.value) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainer.value;
        canScrollLeft.value = scrollLeft > 1;
        canScrollRight.value = scrollLeft + clientWidth < scrollWidth - 1;
    }
};

onMounted(() => {
    checkScroll();
});
</script>

<template>
    <DisplayCard
        :title="``"
        :updatedTimeUtc="0"
        class="rounded-md border !px-0 !py-0"
        @click="isVisible = true"
    >
        <template #content>
            <div class="flex items-center justify-between">
                <div
                    class="flex-shrink-0 whitespace-nowrap pl-3 font-medium"
                    :class="isMobileScreen ? 'text-xs' : 'text-sm'"
                >
                    {{ assignedGroup.name }}
                </div>
                <div class="flex">
                    <LButton
                        variant="tertiary"
                        size="sm"
                        :icon="TrashIcon"
                        title="Remove group access"
                        class="gap-x-0"
                        @click.stop="removeAssignedGroup"
                        mainDynamicCss="text-zinc-400 hover:text-red-500"
                        v-if="!disabled"
                    />

                    <div v-if="typesWithActivePermissions.length > 0">
                        <DuplicateGroupAclButton
                            :groups="availableGroups"
                            @select="duplicateGroup"
                            data-test="duplicateAcl"
                            v-if="!disabled"
                        />
                    </div>
                </div>
            </div>
            <div v-if="typesWithActivePermissions.length > 0" class="group relative py-1">
                <div
                    v-if="canScrollLeft"
                    class="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-start bg-gradient-to-r from-white to-transparent pl-1"
                >
                    <ChevronLeftIcon class="h-3 w-3 text-gray-400" />
                </div>
                <div
                    ref="scrollContainer"
                    @scroll="checkScroll"
                    class="mx-1 flex gap-1 overflow-x-auto scrollbar-hide"
                >
                    <div
                        v-for="aclEntry in activeAclEntries"
                        :key="aclEntry.type"
                        class="flex flex-shrink-0 items-baseline rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"
                    >
                        <span>{{ capitaliseFirstLetter(aclEntry.type) }}</span>
                        <span class="ml-0.5 text-[9px]">
                            (<span
                                v-for="permission in activePermissions(aclEntry)"
                                :key="permission"
                            >
                                {{ getTheFirstLetter(capitaliseFirstLetter(permission)) }} </span
                            >)
                        </span>
                    </div>
                </div>
                <div
                    v-if="canScrollRight"
                    class="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-end bg-gradient-to-l from-white to-transparent pr-1"
                >
                    <ChevronRightIcon class="h-3 w-3 text-gray-500" />
                </div>
            </div>
            <div v-else class="px-2 py-1 text-center text-[11px] text-zinc-500">
                No active permissions, click to add
            </div>
        </template>
    </DisplayCard>

    <LModal v-model:isVisible="isVisible" :heading="assignedGroup.name" noDivider>
        <div class="min-h-72">
            <div
                v-if="typesWithActivePermissions.length > 0"
                class="mb-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500 ring-1 ring-zinc-200"
            >
                <span class="font-semibold text-zinc-700">{{ assignedGroup.name }}</span>
                has this access to
                <span class="font-semibold text-zinc-700">{{ group?.name }}</span>
            </div>
            <div v-if="typesWithActivePermissions.length === 0" class="text-xs">
                No active permissions, use the selector to add
            </div>
            <div class="mb-3">
                <EditAclEntry
                    v-for="aclEntry in activeAclEntries"
                    :key="aclEntry.type"
                    :originalGroup="originalGroup"
                    :aclEntry="aclEntry"
                    :disabled="disabled"
                />
            </div>
        </div>
        <div>
            <LDropdown
                class="relative"
                padding="none"
                v-model:show="showSelector"
                placement="top-start"
                width="auto"
            >
                <template #trigger>
                    <LButton
                        variant="secondary"
                        size="sm"
                        :class="isMobileScreen ? '!px-2 !py-2 text-xs' : ''"
                        mainDynamicCss="text-zinc-600"
                    >
                        Add / Remove
                    </LButton>
                </template>
                <button
                    v-for="aclEntry in visibleAclEntries"
                    :key="aclEntry.type"
                    @click="toggleAclEntry(aclEntry)"
                    class="flex items-center gap-1 rounded-md border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition-colors"
                >
                    <CheckCircleIcon
                        v-if="typesWithActivePermissions.includes(aclEntry.type)"
                        class="inline h-3 w-3"
                    />
                    <div v-else class="h-2.5 w-2.5 rounded-md border border-zinc-400"></div>
                    {{ capitaliseFirstLetter(aclEntry.type) }}
                </button>
            </LDropdown>
        </div>
    </LModal>
</template>
