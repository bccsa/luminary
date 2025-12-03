<script setup lang="ts">
import DisplayCard from "@/components/common/DisplayCard.vue";
import { db, DocType, type LanguageDto, verifyAccess, AclPermission } from "luminary-shared";
import LBadge from "@/components/common/LBadge.vue";
import { DateTime } from "luxon";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
</script>

<template>
    <div
        v-for="language in languages"
        :key="language._id"
        :languagesDoc="language"
        class="flex flex-col gap-4 pt-1"
    >
        <DisplayCard
            title=""
            :updatedTimeUtc="0"
            class="!divide-y-0"
            @click="$router.push({ name: 'language', params: { id: language._id } })"
        >
            <template #content>
                <div class="flex justify-between py-1">
                    <div>
                        <span>
                            <LBadge>{{ language.languageCode.toLocaleUpperCase() }}</LBadge>
                            {{ language.name }}
                        </span>
                    </div>
                    <div>
                        <LBadge v-if="language.default" variant="success">Default</LBadge>
                    </div>
                    <div :class="language.default ? 'pr-6' : ''">
                        {{
                            db
                                .toDateTime(language.updatedTimeUtc)
                                .toLocaleString(DateTime.DATETIME_SHORT)
                        }}
                    </div>
                    <div>
                        <LButton
                            variant="tertiary"
                            :icon="
                                verifyAccess(
                                    language.memberOf,
                                    DocType.Language,
                                    AclPermission.Edit,
                                )
                                    ? PencilSquareIcon
                                    : EyeIcon
                            "
                            @click="
                                $router.push({ name: 'language', params: { id: language._id } })
                            "
                            class="flex justify-end"
                        ></LButton>
                    </div>
                </div>
            </template>
        </DisplayCard>
    </div>
</template>
