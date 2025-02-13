import { BookOpenIcon, HomeIcon, PlayIcon } from "@heroicons/vue/24/outline";
import {
    BookOpenIcon as FilledBookOpenIcon,
    HomeIcon as FilledHomeIcon,
    PlayIcon as FilledPlayIcon,
} from "@heroicons/vue/24/solid";
import { useI18n } from "vue-i18n";

export function getNavigationItems() {
    const { t } = useI18n();

    const navigationItems = [
        {
            name: t("menu.home"),
            defaultIcon: HomeIcon,
            selectedIcon: FilledHomeIcon,
            to: { name: "home" },
        },
        {
            name: t("menu.explore"),
            defaultIcon: BookOpenIcon,
            selectedIcon: FilledBookOpenIcon,
            to: { name: "explore" },
        },
        {
            name: t("menu.video"),
            defaultIcon: PlayIcon,
            selectedIcon: FilledPlayIcon,
            to: { name: "video" },
        },
    ];

    // Exclude the "Explore" navigation item if the env variable "VITE_HIDE_EXPLORE" is set to "true"
    return import.meta.env.VITE_HIDE_EXPLORE === "true"
        ? navigationItems.filter((item) => item.name !== t("menu.explore"))
        : navigationItems;
}
