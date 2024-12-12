import { BookOpenIcon, HomeIcon } from "@heroicons/vue/24/outline";
import {
    BookOpenIcon as FilledBookOpenIcon,
    HomeIcon as FilledHomeIcon,
} from "@heroicons/vue/24/solid";

const navigationItems = [
    {
        name: "Home",
        defaultIcon: HomeIcon,
        selectedIcon: FilledHomeIcon,
        to: { name: "home" },
    },
    {
        name: "Explore",
        defaultIcon: BookOpenIcon,
        selectedIcon: FilledBookOpenIcon,
        to: { name: "explore" },
    },
];

// Exclude the "Explore" navigation item if the eenv variable "VITE_HIDE_EXPLORE" is set to "true"
// Note that this is a temporary solution to hide the "Explore" navigation item

export const commonNavigation =
    import.meta.env.VITE_HIDE_EXPLORE === "true"
        ? navigationItems.filter((item) => item.name !== "Explore")
        : navigationItems;
