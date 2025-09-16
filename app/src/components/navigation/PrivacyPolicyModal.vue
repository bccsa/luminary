<script setup lang="ts">
import { appLanguageIdsAsRef, userPreferencesAsRef } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import { ShieldCheckIcon } from "@heroicons/vue/24/outline";
import { db, useDexieLiveQuery, type ContentDto } from "luminary-shared";
import { computed, watch, h, type ComputedRef } from "vue";
import LModal from "@/components/form/LModal.vue";
import LButton from "@/components/button/LButton.vue";
import { useI18n } from "vue-i18n";
import { useAuth0 } from "@auth0/auth0-vue";
import { useRouter } from "vue-router";

const { t } = useI18n();
const { isAuthenticated, logout } = useAuth0();
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

// Logic for showing the "Necessary only" button
const necessaryOnlyLogic = computed(() => {
    if (!userPreferencesAsRef.value.privacyPolicy?.status && !isAuthenticated.value) return true;
    if (status.value == "outdated" && !isAuthenticated.value) return true;
    if (userPreferencesAsRef.value.privacyPolicy?.status == "accepted" && !isAuthenticated.value)
        return true;

    return false;
});

const modalMessageMap = {
    accepted: t("privacy_policy.modal.message_map.accepted"),
    outdated: t("privacy_policy.modal.message_map.outdated"),
    unaccepted: t("privacy_policy.modal.message_map.unaccepted"),
    necessaryOnly: t("privacy_policy.banner.message_map.necessaryOnly"),
};

const bannerMessageMap = {
    ...modalMessageMap,
    outdated: t("privacy_policy.banner.message_map.outdated"),
    unaccepted: t("privacy_policy.banner.message_map.unaccepted"),
    necessaryOnly: t("privacy_policy.banner.message_map.necessaryOnly"),
};

const status: ComputedRef<"accepted" | "outdated" | "unaccepted" | "necessaryOnly"> = computed(
    () => {
        if (!userPreferencesAsRef.value.privacyPolicy) return "unaccepted";
        if (
            userPreferencesAsRef.value.privacyPolicy.status !== "accepted" &&
            userPreferencesAsRef.value.privacyPolicy.status !== "necessaryOnly" &&
            !isAuthenticated.value
        )
            return "unaccepted";
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

        if (userPreferencesAsRef.value.privacyPolicy.status == "necessaryOnly")
            return "necessaryOnly";

        return "accepted";
    },
);

// Wait 2 seconds before showing the privacy policy banner
setTimeout(() => {
    watch(
        status,
        (status) => {
            if (!status || (status != "accepted" && status != "necessaryOnly")) {
                useNotificationStore().addNotification({
                    id: "privacy-policy-banner",
                    type: "bottom",
                    state: "info",
                    title:
                        status == "outdated"
                            ? t("privacy_policy.banner.title_map.outdated")
                            : t("privacy_policy.banner.title"),
                    description: bannerMessageMap[status],
                    icon: ShieldCheckIcon,
                    link: () => (show.value = true),
                    closable: false,
                    actions: () =>
                        h(
                            "div",
                            {
                                class: "flex flex-col items-stretch space-y-2 mt-2 md:flex-row md:items-center md:space-y-0 md:space-x-2",
                            },
                            [
                                // Accept Button
                                h(
                                    LButton,
                                    {
                                        variant: "primary",
                                        name: "accept",
                                        onClick: () => {
                                            userPreferencesAsRef.value.privacyPolicy = {
                                                status: "accepted",
                                                ts: Date.now(),
                                            };
                                            useNotificationStore().removeNotification(
                                                "privacy-policy-banner",
                                            );
                                        },
                                    },
                                    () => t("privacy_policy.modal.button_accept"),
                                ),
                                // Necessary Only Button (shown only when necessaryOnlyLogic is true)
                                h(
                                    LButton,
                                    {
                                        variant: "secondary",
                                        name: "necessary-only",
                                        onClick: () => {
                                            userPreferencesAsRef.value.privacyPolicy = {
                                                status: "necessaryOnly",
                                                ts: Date.now(),
                                            };
                                            useNotificationStore().removeNotification(
                                                "privacy-policy-banner",
                                            );
                                        },
                                        style: necessaryOnlyLogic.value ? {} : { display: "none" },
                                    },
                                    () => t("privacy_policy.modal.button_necessaryOnly"),
                                ),
                                // Log Out Button (shown only for authenticated users when status is outdated and previously accepted)
                                status === "outdated" &&
                                userPreferencesAsRef.value.privacyPolicy?.status === "accepted" &&
                                isAuthenticated.value
                                    ? h(
                                          LButton,
                                          {
                                              variant: "secondary",
                                              name: "deny",
                                              onClick: () => {
                                                  userPreferencesAsRef.value.privacyPolicy =
                                                      undefined;
                                                  logout({
                                                      logoutParams: {
                                                          returnTo: window.location.origin,
                                                      },
                                                  });
                                                  useNotificationStore().removeNotification(
                                                      "privacy-policy-banner",
                                                  );
                                              },
                                          },
                                          () => t("privacy_policy.modal.button_logOut"),
                                      )
                                    : null,
                                // More Info Button
                                h(
                                    LButton,
                                    {
                                        variant: "secondary",
                                        name: "more-info",
                                        class: "text-nowrap",
                                        onClick: () => {
                                            router.push({
                                                name: "content",
                                                params: { slug: "privacy-policy" },
                                            });
                                        },
                                    },
                                    () => t("privacy_policy.modal.button_readMore"),
                                ),
                            ].filter(Boolean), // Remove null values from the array
                        ),
                });
                return;
            }

            useNotificationStore().removeNotification("privacy-policy-banner");
        },
        { immediate: true },
    );
}, 2000);
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
                    v-if="
                        !userPreferencesAsRef.privacyPolicy?.status ||
                        status === 'outdated' ||
                        status === 'necessaryOnly' ||
                        (userPreferencesAsRef.privacyPolicy?.status !== 'accepted' &&
                            !isAuthenticated)
                    "
                    variant="primary"
                    name="accept"
                    @click="
                        userPreferencesAsRef.privacyPolicy = {
                            status: 'accepted',
                            ts: Date.now(),
                        };
                        show = false;
                    "
                >
                    {{ t("privacy_policy.modal.button_accept") }}
                </LButton>

                <LButton
                    v-if="
                        status === 'outdated' &&
                        userPreferencesAsRef.privacyPolicy?.status === 'accepted' &&
                        isAuthenticated
                    "
                    @click="
                        userPreferencesAsRef.privacyPolicy = undefined;
                        logout();
                        useNotificationStore().removeNotification('privacy-policy-banner');
                        show = false;
                    "
                >
                    {{ t("privacy_policy.modal.button_logOut") }}
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
                    {{ t("privacy_policy.modal.button_necessaryOnly") }}
                </LButton>
                <LButton
                    variant="secondary"
                    name="more-info"
                    @click="
                        router.push({ name: 'content', params: { slug: 'privacy-policy' } });
                        show = false;
                    "
                >
                    {{ t("privacy_policy.modal.button_readMore") }}
                </LButton>
            </div>
        </template>
    </LModal>
</template>
