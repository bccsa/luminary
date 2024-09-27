<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { db, DocType, type LanguageDto, type Uuid } from "luminary-shared";
import { useRouter } from "vue-router";
import LInput from "../forms/LInput.vue";
import GroupSelector from "../groups/GroupSelector.vue";
// import LButton from "../button/LButton.vue";
import LBadge from "../common/LBadge.vue";

const router = useRouter();

const { id } = router.currentRoute.value.params;
const currentLanguage = db.getAsRef(id as Uuid) as unknown as LanguageDto;

const isLocalChange = db.isLocalChangeAsRef(currentLanguage._id);
</script>

<template>
    <BasePage v-if="currentLanguage" :title="`${currentLanguage.name}`">
        <template #actions>
            <LBadge v-if="isLocalChange" variant="warning" class="mr-4">Offline changes</LBadge>

            <!-- <LButton type="button" data-test="save-button" variant="primary"> Save </LButton> -->
        </template>
        <div class="b-4">
            <LInput
                label="Name"
                size="sm"
                name="languageName"
                class="w-full"
                v-model="currentLanguage.name"
            />
            <LInput
                label="Code"
                size="sm"
                name="languageCode"
                class="mt-6 w-full"
                v-model="currentLanguage.languageCode"
            />

            <GroupSelector
                v-model:groups="currentLanguage.memberOf"
                :docType="DocType.Language"
                class="mt-6"
            />
        </div>
    </BasePage>
</template>
