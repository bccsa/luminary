<script setup lang="ts">
import { ApiLiveQueryAsEditable, type GroupDto } from "luminary-shared";
import LCard from "../common/LCard.vue";
import GroupRow from "./GroupRow.vue";

type Props = {
    groupsQuery: ApiLiveQueryAsEditable<GroupDto>;
};
const props = defineProps<Props>();

const { liveData } = props.groupsQuery;

defineEmits<{
    (e: "save", group: GroupDto): void;
    (e: "delete", group: GroupDto): void;
    (e: "duplicate", group: GroupDto): void;
}>();
</script>

<template>
    <LCard padding="none">
        <div class="overflow-x-auto rounded-md">
            <div class="inline-block min-w-full align-middle">
                <table class="min-w-full divide-y divide-zinc-200">
                    <thead class="bg-zinc-50">
                        <tr>
                            <!-- name -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">Name</div>
                            </th>

                            <!-- status -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            ></th>

                            <!-- Have accessTo -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            ></th>

                            <!-- updated -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">Last updated</div>
                            </th>
                            <!-- actions -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            ></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-200 bg-white" v-if="liveData.length">
                        <GroupRow
                            v-for="group in liveData"
                            :key="group._id"
                            :group="group"
                            :groupQuery="groupsQuery"
                            @save="$emit('save', $event)"
                            @delete="$emit('delete', $event)"
                            @duplicate="$emit('duplicate', $event)"
                        />
                    </tbody>
                </table>
            </div>
        </div>
    </LCard>
</template>
