<script setup lang="ts">
import { AclPermission, DocType, hasAnyPermission, db, type RedirectDto } from "luminary-shared";
import BasePage from "../BasePage.vue";
import RedirectTable from "./RedirectTable.vue";
import RedirectDisplaycard from "./RedirectDisplaycard.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { computed, ref } from "vue";
import LButton from "../button/LButton.vue";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";

const canCreateNew = computed(() => hasAnyPermission(DocType.Redirect, AclPermission.Edit));
const isModalVisible = ref(false);
const redirects = db.whereTypeAsRef<RedirectDto[]>(DocType.Redirect, []);
</script>

<template>
    <BasePage title="Redirects">
        <template #actions>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="isModalVisible = true"
                    name="createLanguageBtn"
                >
                    Create redirect
                </LButton>
            </div>
        </template>

        <RedirectTable />
        <!-- <RedirectDisplaycard
            v-for="redirect in redirects"
            :key="redirect._id"
            :redirectDoc="redirect"
        /> -->

        <CreateOrEditRedirectModal
            v-if="isModalVisible"
            :isVisible="isModalVisible"
            @close="isModalVisible = false"
        />
    </BasePage>
</template>
