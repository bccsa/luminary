<script setup lang="ts">
import { useGroupStore } from "@/stores/group";
import { AclPermission, DocType, type Group } from "@/types";
import { capitaliseFirstLetter } from "@/util/string";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/vue";
import { CheckCircleIcon, MinusCircleIcon } from "@heroicons/vue/16/solid";
import { ChevronUpIcon, RectangleStackIcon } from "@heroicons/vue/20/solid";
import { computed } from "vue";

const availableAclsPerDocType = {
    [DocType.Group]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
    ],
    [DocType.Language]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
    ],
    [DocType.Post]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Translate,
        AclPermission.Publish,
    ],
    [DocType.Tag]: [
        AclPermission.View,
        AclPermission.Create,
        AclPermission.Edit,
        AclPermission.Delete,
        AclPermission.Assign,
        AclPermission.Translate,
        AclPermission.Publish,
    ],
    [DocType.User]: [AclPermission.View, AclPermission.Edit, AclPermission.Delete],
};

type Props = {
    group: Group;
};
const props = defineProps<Props>();

const { group: getGroup } = useGroupStore();

const uniqueGroups = computed(() => {
    const groups: string[] = [];

    props.group.acl.forEach((acl) => {
        if (!groups.includes(acl.groupId)) {
            groups.push(acl.groupId);
        }
    });

    return groups.map((groupId) => getGroup(groupId));
});

const hasAssignedPermission = computed(() => {
    return (subGroup: Group, docType: DocType, aclPermission: AclPermission) => {
        const permissionForDocType = props.group.acl.find((acl) => {
            return acl.groupId == subGroup._id && acl.type == docType;
        });

        if (!permissionForDocType) {
            return false;
        }

        return permissionForDocType.permission.includes(aclPermission);
    };
});

const isPermissionAvailabe = computed(() => {
    return (docType: DocType, aclPermission: AclPermission) => {
        // @ts-expect-error Not alle DocTypes are in the array but we only call it with ones that are
        return availableAclsPerDocType[docType].includes(aclPermission);
    };
});
</script>

<template>
    <div class="w-full rounded-lg bg-white shadow">
        <Disclosure v-slot="{ open }">
            <DisclosureButton class="flex w-full justify-between px-6 py-4">
                <div class="flex items-center gap-2">
                    <RectangleStackIcon class="h-5 w-5 text-zinc-400" />
                    <h2 class="font-medium text-zinc-800">{{ group.name }}</h2>
                </div>
                <ChevronUpIcon :class="{ 'rotate-180 transform': !open }" class="h-5 w-5" />
            </DisclosureButton>
            <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-out"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
            >
                <DisclosurePanel
                    class="space-y-6 overflow-x-scroll px-6 pb-10 pt-2 lg:overflow-hidden"
                >
                    <div
                        v-for="subGroup in uniqueGroups"
                        :key="subGroup?._id"
                        class="inline-block rounded-xl border border-zinc-100/50 bg-zinc-50 shadow-sm"
                    >
                        <h3 class="border-b border-zinc-200 px-6 py-4 font-medium text-zinc-700">
                            {{ subGroup?.name }}
                        </h3>

                        <table>
                            <thead class="border-b border-zinc-200 bg-zinc-100 last:border-none">
                                <tr>
                                    <th></th>
                                    <th
                                        v-for="aclPermission in AclPermission"
                                        :key="aclPermission"
                                        class="p-4 text-center text-sm font-medium uppercase tracking-wider text-zinc-600 last:pr-6"
                                    >
                                        {{ capitaliseFirstLetter(aclPermission) }}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="docType in Object.keys(availableAclsPerDocType)"
                                    :key="docType"
                                    class="border-b border-zinc-200 last:border-none"
                                >
                                    <th scope="row" class="py-3 pl-6 pr-10 text-left font-medium">
                                        {{ capitaliseFirstLetter(docType) }}
                                    </th>
                                    <td
                                        v-for="aclPermission in AclPermission"
                                        :key="aclPermission"
                                        class="text-center"
                                    >
                                        <template
                                            v-if="
                                                subGroup &&
                                                hasAssignedPermission(
                                                    subGroup,
                                                    docType as DocType,
                                                    aclPermission,
                                                )
                                            "
                                        >
                                            <CheckCircleIcon class="inline h-4 w-4 text-zinc-500" />
                                        </template>
                                        <template v-else>
                                            <MinusCircleIcon
                                                :class="[
                                                    'inline h-4 w-4',
                                                    isPermissionAvailabe(
                                                        docType as DocType,
                                                        aclPermission,
                                                    )
                                                        ? 'text-zinc-300'
                                                        : 'text-zinc-100',
                                                ]"
                                            />
                                        </template>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </DisclosurePanel>
            </transition>
        </Disclosure>
    </div>
</template>
