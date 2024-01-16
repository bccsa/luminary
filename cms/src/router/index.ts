import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import { authGuard } from "@auth0/auth0-vue";

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: "/",
            beforeEnter: authGuard,
            children: [
                {
                    path: "/",
                    name: "dashboard",
                    component: HomeView,
                },
                {
                    path: "/articles",
                    name: "articles",
                    component: () => import("../views/AboutView.vue"),
                },
                {
                    path: "/videos",
                    name: "videos",
                    component: () => import("../views/AboutView.vue"),
                },
                {
                    path: "/users",
                    name: "users",
                    component: () => import("../views/AboutView.vue"),
                },
            ],
        },
    ],
});

export default router;
