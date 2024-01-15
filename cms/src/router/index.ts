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
                    name: "home",
                    component: HomeView,
                },
                {
                    path: "/about",
                    name: "about",
                    // route level code-splitting
                    // this generates a separate chunk (About.[hash].js) for this route
                    // which is lazy-loaded when the route is visited.
                    component: () => import("../views/AboutView.vue"),
                },
            ],
        },
    ],
});

export default router;
