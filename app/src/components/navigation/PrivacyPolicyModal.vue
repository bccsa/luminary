<script setup lang="ts">
import { appLanguageIdsAsRef, userPreferencesAsRef } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import { ShieldCheckIcon } from "@heroicons/vue/24/outline";
import { db, useDexieLiveQuery, type ContentDto } from "luminary-shared";
import { computed, watch } from "vue";
import LModal from "@/components/form/LModal.vue";
import LButton from "@/components/button/LButton.vue";
import { useI18n } from "vue-i18n";
const { t } = useI18n();

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

const modalMessageMap = {
    accepted: t("privacy_policy.modal.message_map.accepted"),
    declined: t("privacy_policy.modal.message_map.declined"),
    outdated: t("privacy_policy.modal.message_map.outdated"),
    unaccepted: t("privacy_policy.modal.message_map.unaccepted"),
};

const bannerMessageMap = {
    ...modalMessageMap,
    outdated: t("privacy_policy.banner.message_map.outdated"),
    unaccepted: t("privacy_policy.banner.message_map.unaccepted"),
};

const status = computed(() => {
    if (!userPreferencesAsRef.value.privacyPolicy) return "unaccepted";
    if (userPreferencesAsRef.value.privacyPolicy.status == "declined") return "declined";
    if (
        privacyPolicy.value &&
        privacyPolicy.value.publishDate &&
        privacyPolicy.value.publishDate > userPreferencesAsRef.value.privacyPolicy.ts
    )
        return "outdated";

    if (
        privacyPolicy.value &&
        privacyPolicy.value.publishDate &&
        userPreferencesAsRef.value.privacyPolicy.status == "accepted" &&
        privacyPolicy.value.publishDate > userPreferencesAsRef.value.privacyPolicy.ts
    )
        return "outdated";
    return "accepted";
});

const linkHtml = `
      <RouterLink
        :to="{ name: 'content', params: { slug: 'privacy-policy' } }"
        class="text-blue-600  dark:text-yellow-400 cursor-pointer"
        @click="router.push({ name: 'content', params: { slug: 'privacy-policy' } })"
      >
        ${t("privacy_policy.modal.link_text")}
      </RouterLink>
    `;

const translatedMessage = t("privacy_policy.modal.message_link", { link: linkHtml });

// Wait 3 seconds before showing the privacy policy banner
setTimeout(() => {
    watch(
        status,
        (status) => {
            if (status != "accepted" && status != "declined") {
                useNotificationStore().addNotification({
                    id: "privacy-policy-banner",
                    type: "banner",
                    state: "info",
                    title: "Privacy Policy",
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
        <p class="mb-4 mt-4 text-gray-700 dark:text-slate-300">
            {{ modalMessageMap[status] }}
        </p>
        <p v-html="translatedMessage" class="mb-8 italic text-gray-700 dark:text-slate-300"></p>

        <template #footer>
            <div class="flex justify-end space-x-2">
                <LButton
                    v-if="status != 'accepted'"
                    variant="primary"
                    name="accept"
                    @click="
                        userPreferencesAsRef.privacyPolicy = { status: 'accepted', ts: Date.now() };
                        show = false;
                    "
                    >{{ t("privacy_policy.modal.button_accept") }}
                </LButton>
                <LButton
                    v-if="status == 'accepted'"
                    variant="primary"
                    name="close"
                    @click="show = false"
                    >{{ t("privacy_policy.modal.button_close") }}</LButton
                >
                <LButton
                    variant="secondary"
                    name="decline"
                    @click="
                        userPreferencesAsRef.privacyPolicy = { status: 'declined', ts: Date.now() };
                        show = false;
                    "
                >
                    {{ t("privacy_policy.modal.button_decline") }}
                </LButton>
            </div>
        </template>
    </LModal>
</template>
