<script setup lang="ts">
import { AclPermission, DocType, hasAnyPermission, db, type RedirectDto } from "luminary-shared";
import BasePage from "../BasePage.vue";
import RedirectDisplaycard from "./RedirectDisplaycard.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { computed, ref } from "vue";
import LButton from "../button/LButton.vue";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";

const canCreateNew = computed(() => hasAnyPermission(DocType.Redirect, AclPermission.Edit));
const isCreateOrEditModalVisible = ref(false);
const redirects = db.whereTypeAsRef<RedirectDto[]>(DocType.Redirect, []);
</script>

<template>
    <BasePage title="Redirects" :should-show-page-title="false">
        <template #pageNav>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="isCreateOrEditModalVisible = true"
                    name="createLanguageBtn"
                >
                    Create redirect
                </LButton>
            </div>
        </template>

        <RedirectDisplaycard
            v-for="redirect in redirects"
            :key="redirect._id"
            :redirectDoc="redirect"
        />

        <CreateOrEditRedirectModal
            v-if="isCreateOrEditModalVisible"
            :isVisible="isCreateOrEditModalVisible"
            @close="isCreateOrEditModalVisible = false"
        />
    </BasePage>
</template>
