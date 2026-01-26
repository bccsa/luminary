<script setup lang="ts">
import { AclPermission, DocType, hasAnyPermission, db, type RedirectDto } from "luminary-shared";
import BasePage from "../BasePage.vue";
import RedirectTable from "./RedirectTable.vue";
import RedirectDisplaycard from "./RedirectDisplaycard.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { computed, ref } from "vue";
import LButton from "../button/LButton.vue";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";

type Props = {
    redirectDoc: RedirectDto;
};
const props = defineProps<Props>();

const canCreateNew = computed(() => hasAnyPermission(DocType.Redirect, AclPermission.Edit));
const isNewModalVisible = ref(false);
const redirects = db.whereTypeAsRef<RedirectDto[]>(DocType.Redirect, []);
const isEditModalVisible = ref(false);
</script>

<template>
    <BasePage title="Redirects" :should-show-page-title="false">
        <template #pageNav>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="isNewModalVisible = true"
                    name="createLanguageBtn"
                >
                    Create redirect
                </LButton>
            </div>
        </template>

        <RedirectTable />
        <RedirectDisplaycard
            v-for="redirect in redirects"
            :key="redirect._id"
            :redirectDoc="redirect"
            v-model="isEditModalVisible"
        />

        <CreateOrEditRedirectModal
            v-if="isNewModalVisible || isEditModalVisible"
            :isVisible="isNewModalVisible || isEditModalVisible"
            :redirect="isEditModalVisible ? undefined : redirectDoc"
            @close="isNewModalVisible = false; isEditModalVisible= false"
        />
    </BasePage>
</template>
