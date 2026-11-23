import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createApp, defineComponent, h, inject, nextTick, ref } from "vue";
import { AppPromoKey } from "@/build-time/contracts/app-promo/token";
import type { AppPromoService } from "@/build-time/contracts/app-promo/contract";
import { installAppPromo } from "../index";
import { provideAppPromo, provideAppPromoHolder } from "../provide";
import AppPromoSlot from "../AppPromoSlot.vue";

const Promo = defineComponent({
    name: "PromoLink",
    setup: () => () => h("a", { "data-test": "promo" }, "Get the app"),
});

const promoFor = (component = Promo): AppPromoService => ({
    component: (placement) => (placement === "player-download" ? component : undefined),
});

function injected(app: ReturnType<typeof createApp>) {
    return app.runWithContext(() => inject(AppPromoKey, undefined));
}

describe("the promotion holder", () => {
    it("is provided empty by the in-app entry", () => {
        const app = createApp({});
        installAppPromo(app);

        const service = injected(app);
        expect(service).toBeDefined();
        expect(service!.component("player-download")).toBeUndefined();
    });

    it("is provided once however often it is asked for", () => {
        const app = createApp({});
        provideAppPromoHolder(app);
        const first = injected(app);
        provideAppPromoHolder(app);
        installAppPromo(app);

        expect(injected(app)).toBe(first);
    });

    it("hands out a filled service's components through the holder consumers already have", () => {
        const app = createApp({});
        provideAppPromoHolder(app);
        const service = injected(app)!;

        provideAppPromo(app, promoFor());

        expect(service.component("player-download")).toBe(Promo);
    });
});

describe("AppPromoSlot", () => {
    it("renders nothing without a service", () => {
        const wrapper = mount(AppPromoSlot, { props: { placement: "player-download" } });

        expect(wrapper.element.nodeType).toBe(Node.COMMENT_NODE);
        expect(wrapper.html()).not.toMatch(/<[a-z]/i);
    });

    it("renders nothing while the holder is empty", () => {
        const wrapper = mount(AppPromoSlot, {
            props: { placement: "player-download" },
            global: { plugins: [{ install: provideAppPromoHolder }] },
        });

        expect(wrapper.element.nodeType).toBe(Node.COMMENT_NODE);
    });

    it("renders the service's component for its placement", () => {
        const wrapper = mount(AppPromoSlot, {
            props: { placement: "player-download" },
            global: { provide: { [AppPromoKey as symbol]: promoFor() } },
        });

        expect(wrapper.find("[data-test='promo']").text()).toBe("Get the app");
    });

    it("shows the component when installation lands after it was set up", async () => {
        let host: ReturnType<typeof createApp> | undefined;
        const wrapper = mount(AppPromoSlot, {
            props: { placement: "player-download" },
            global: {
                plugins: [
                    {
                        install(app) {
                            host = app;
                            provideAppPromoHolder(app);
                        },
                    },
                ],
            },
        });
        expect(wrapper.find("[data-test='promo']").exists()).toBe(false);

        provideAppPromo(host!, promoFor());
        await nextTick();

        expect(wrapper.find("[data-test='promo']").exists()).toBe(true);
    });

    it("follows the service's answer as it changes", async () => {
        const shown = ref(false);
        const wrapper = mount(AppPromoSlot, {
            props: { placement: "player-download" },
            global: {
                provide: {
                    [AppPromoKey as symbol]: {
                        component: () => (shown.value ? Promo : undefined),
                    } satisfies AppPromoService,
                },
            },
        });
        expect(wrapper.find("[data-test='promo']").exists()).toBe(false);

        shown.value = true;
        await nextTick();

        expect(wrapper.find("[data-test='promo']").exists()).toBe(true);
    });
});
