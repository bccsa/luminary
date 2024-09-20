import { BookOpenIcon, HomeIcon } from "@heroicons/vue/24/outline";
import {
    BookOpenIcon as FilledBookOpenIcon,
    HomeIcon as FilledHomeIcon,
} from "@heroicons/vue/24/solid";

export const commonNavigation = [
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
        to: { name: "topics" },
    },
];
