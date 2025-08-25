<script setup lang="ts">
import { appLanguageIdsAsRef, userPreferencesAsRef } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import { ShieldCheckIcon } from "@heroicons/vue/24/outline";
import { db, useDexieLiveQuery, type ContentDto } from "luminary-shared";
import { computed, watch } from "vue";
import LModal from "@/components/form/LModal.vue";
import LButton from "@/components/button/LButton.vue";
import { useI18n } from "vue-i18n";
import { useAuth0 } from "@auth0/auth0-vue";
import { useRouter } from "vue-router";

const { t } = useI18n();
const { isAuthenticated } = useAuth0();
const router = useRouter();

const show = defineModel<boolean>("show");

// Set the privacy policy status to "updated" if the policy has changed and the user previously accepted it
const privacyPolicy = useDexieLiveQuery(
    () =>
        db.docs
            .where({
                parentId: import.meta.env.VITE_PRIVACY_POLICY_ID,
            })
            .filter((c) => {
                const content = c as ContentDto;
                const firstSupportedLang = appLanguageIdsAsRef.value.find((lang) =>
                    content.availableTranslations?.includes(lang),
                );
                if (content.language == firstSupportedLang) return true;

                return false;
            })
            .first() as unknown as ContentDto | undefined,
);

const necessaryOnlyLogic = computed(() => {
    if (
        !isAuthenticated.value &&
        userPreferencesAsRef.value.privacyPolicy?.status == "necessaryOnly"
    )
        return false;

    if (!userPreferencesAsRef.value.privacyPolicy?.status) return true;
    if (!isAuthenticated.value && userPreferencesAsRef.value.privacyPolicy?.status) return true;

    if (isAuthenticated.value && !userPreferencesAsRef.value.privacyPolicy?.status) return false;

    return false;
});

const modalMessageMap = {
    accepted: t("privacy_policy.modal.message_map.accepted"),
    // declined: t("privacy_policy.modal.message_map.declined"),
    outdated: t("privacy_policy.modal.message_map.outdated"),
    unaccepted: t("privacy_policy.modal.message_map.unaccepted"),
    necessaryOnly:
        "You have chosen to accept only necessary cookies. if you want a better experience, please click on accept.",
};

const bannerMessageMap = {
    ...modalMessageMap,
    outdated: t("privacy_policy.banner.message_map.outdated"),
    unaccepted: t("privacy_policy.banner.message_map.unaccepted"),
    necessaryOnly: t("privacy_policy.banner.message_map.necessary_only"),
};

const status = computed(() => {
    if (!userPreferencesAsRef.value.privacyPolicy) return "unaccepted";
    // if (userPreferencesAsRef.value.privacyPolicy.status == "declined") return "declined";
    if (
        privacyPolicy.value &&
        privacyPolicy.value.publishDate &&
        privacyPolicy.value.publishDate > userPreferencesAsRef.value.privacyPolicy.ts
    )
        return "outdated";

    if (
        privacyPolicy.value &&
        privacyPolicy.value.publishDate &&
        (userPreferencesAsRef.value.privacyPolicy.status == "accepted" ||
            userPreferencesAsRef.value.privacyPolicy.status == "necessaryOnly") &&
        privacyPolicy.value.publishDate > userPreferencesAsRef.value.privacyPolicy.ts
    )
        return "outdated";

    if (userPreferencesAsRef.value.privacyPolicy.status == "necessaryOnly") return "necessaryOnly";
    return "accepted";
});

// Wait 3 seconds before showing the privacy policy banner
setTimeout(() => {
    watch(
        status,
        (status) => {
            if (!status || (status != "accepted" && status != "necessaryOnly")) {
                useNotificationStore().addNotification({
                    id: "privacy-policy-banner",
                    type: "banner",
                    state: "info",
                    title: t("privacy_policy.banner.title"),
                    description: bannerMessageMap[status],
                    icon: ShieldCheckIcon,
                    link: () => (show.value = true),
                    closable: false,
                });
                return;
            }

            useNotificationStore().removeNotification("privacy-policy-banner");
        },
        { immediate: true },
    );
}, 3000);
</script>

<template>
    <LModal
        :isVisible="show || false"
        :heading="t('privacy_policy.modal.title')"
        @close="show = false"
    >
        <p class="mb-4 mt-4 text-gray-700 dark:text-slate-300">{{ modalMessageMap[status] }}</p>

        <p class="pt-1 italic text-gray-700 dark:text-slate-300"></p>

        <template #footer>
            <div class="flex justify-end space-x-2">
                <LButton
                    v-if="!userPreferencesAsRef.privacyPolicy?.status || status === 'necessaryOnly'"
                    variant="primary"
                    name="accept"
                    @click="
                        userPreferencesAsRef.privacyPolicy = {
                            status: 'accepted',
                            ts: Date.now(),
                        };
                        show = false;
                    "
                    >{{ t("privacy_policy.modal.button_accept") }}
                </LButton>

                <LButton
                    v-if="necessaryOnlyLogic"
                    variant="secondary"
                    name="necessary-only"
                    @click="
                        userPreferencesAsRef.privacyPolicy = {
                            status: 'necessaryOnly',
                            ts: Date.now(),
                        };
                        show = false;
                    "
                >
                    Necessary only
                </LButton>
                <LButton
                    variant="secondary"
                    name="decline"
                    @click="
                        router.push({ name: 'content', params: { slug: 'privacy-policy' } });
                        show = false;
                    "
                >
                    More info
                </LButton>
            </div>
        </template>
    </LModal>
</template>
