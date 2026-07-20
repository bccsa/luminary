<script setup lang="ts">
import { computed, ref } from "vue";
import { buildEffectivePermissionsReport } from "@/components/groups/GroupPermissionsReport";
import type { GroupDto } from "luminary-shared";
import LModal from "../modals/LModal.vue";
import LButton from "../button/LButton.vue";
import { EyeIcon } from "@heroicons/vue/24/outline";
import LBadge from "@/components/common/LBadge.vue";
import { capitaliseFirstLetter, getTheFirstLetter } from "@/util/string";
import DisplayCard from "@/components/common/DisplayCard.vue";

const props = defineProps<{
    groupId: string;
    allGroups: GroupDto[];
    groupName: string;
}>();

const isOpen = ref(false);

const permissionsReport = computed(() => {
    if (!props.groupId) return {};
    return buildEffectivePermissionsReport(props.groupId, props.allGroups);
});

const activeAclEntries = computed(() => {
    return Object.values(permissionsReport.value).filter((entry) => {
        return Object.values(entry.permissionsByDocType).some(
            (permissions) => permissions.length > 0,
        );
    });
});
</script>

<template>
    <LButton
        :icon="EyeIcon"
        variant="secondary"
        size="sm"
        title="View permissions report"
        @click="isOpen = true"
        mainDynamicCss="text-zinc-600"
        iconClass="text-zinc-400"
    >
        Permissions
    </LButton>

    <LModal
        v-model:isVisible="isOpen"
        :heading="`Accessors for ${props.groupName}`"
        size="lg"
        largeModal
    >
        <div class="max-h-[80vh] overflow-y-auto p-4">
            <p v-if="activeAclEntries.length === 0" class="py-8 text-center text-zinc-500">
                No group has explicit access to this group.
            </p>

            <div v-for="data in activeAclEntries" :key="data.accessorGroupId" class="mb-6">
                <DisplayCard :title="``" :updatedTimeUtc="0" class="rounded-md border">
                    <template #content>
                        <div class="flex items-center justify-between">
                            <div class="flex-shrink-0 whitespace-nowrap pl-3 font-medium">
                                {{ data.accessorGroupName }}
                                <LBadge
                                    :variant="data.source === 'direct' ? 'blue' : 'info'"
                                    class="ml-2"
                                >
                                    {{ data.source === "direct" ? "Direct Access" : "Inherited" }}
                                </LBadge>
                            </div>
                            <div
                                v-if="data.inheritedViaGroupName"
                                class="text-xs italic text-zinc-400"
                            >
                                via {{ data.inheritedViaGroupName }}
                            </div>
                            <div></div>
                            <div></div>
                            <div></div>
                        </div>
                        <div class="group relative py-1">
                            <div class="mx-1 flex gap-1 overflow-x-auto scrollbar-hide">
                                <template
                                    v-for="(permissions, type) in data.permissionsByDocType"
                                    :key="type"
                                >
                                    <div
                                        v-if="permissions.length > 0"
                                        class="flex flex-shrink-0 items-baseline rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"
                                    >
                                        <span>{{ capitaliseFirstLetter(type) }}</span>
                                        <span class="ml-0.5 text-[9px]">
                                            (<span
                                                v-for="permission in permissions"
                                                :key="permission"
                                            >
                                                {{
                                                    getTheFirstLetter(
                                                        capitaliseFirstLetter(permission),
                                                    )
                                                }} </span
                                            >)
                                        </span>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </template>
                </DisplayCard>
            </div>
        </div>
    </LModal>
</template>
