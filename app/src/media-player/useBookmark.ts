import { computed, type ComputedRef, type Ref } from "vue";
import { PostType, type ContentDto } from "luminary-shared";
import { useI18n } from "vue-i18n";
import { userPreferencesAsRef } from "@/globalConfig";
import { recordAffinity } from "@/recommendation/affinityStore";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { useNotificationStore } from "@/stores/notification";

/**
 * Bookmarking what plays, as the content page does it: the same preference, the same affinity
 * weights, the same toast.
 */
export function useBookmark(content: Ref<ContentDto | undefined>): {
    bookmarkable: ComputedRef<boolean>;
    isBookmarked: ComputedRef<boolean>;
    toggleBookmark: () => void;
} {
    const { t } = useI18n();

    // A page is not bookmarked.
    const bookmarkable = computed(() => content.value?.parentPostType !== PostType.Page);
    const isBookmarked = computed(() =>
        Boolean(userPreferencesAsRef.value.bookmarks?.some((b) => b.id == content.value?.parentId)),
    );

    function toggleBookmark() {
        const current = content.value;
        if (!current) return;
        if (!userPreferencesAsRef.value.bookmarks) userPreferencesAsRef.value.bookmarks = [];

        if (isBookmarked.value) {
            userPreferencesAsRef.value.bookmarks = userPreferencesAsRef.value.bookmarks.filter(
                (b) => b.id != current.parentId,
            );
            recordAffinity(current.parentTags, affinityConfig.value.eventWeight.bookmarkRemoved);
            return;
        }
        userPreferencesAsRef.value.bookmarks.push({ id: current.parentId, ts: Date.now() });
        // Bookmarking is explicit, unambiguous intent: weighted above a plain open.
        recordAffinity(current.parentTags, affinityConfig.value.eventWeight.bookmark);
        useNotificationStore().addNotification({
            id: "bookmark-added",
            title: t("bookmarks.notification.title"),
            description: t("bookmarks.notification.description"),
            state: "success",
            type: "toast",
            timeout: 5000,
        });
    }

    return { bookmarkable, isBookmarked, toggleBookmark };
}
