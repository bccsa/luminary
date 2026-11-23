import { createPinia, setActivePinia } from "pinia";
import { RouterLinkStub } from "@vue/test-utils";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import type { DownloadStartRequest } from "@/build-time/contracts/downloads/contract";
import { useNotificationStore } from "@/stores/notification";
import { createFakeEngine, type FakeEngineOptions } from "../../fakeEngine";
import { createDownloadsService, type DownloadsRuntime } from "../../service";
import { makeContent, makeDeps, makeParent } from "../../__tests__/helpers";

/** A download of item `n`: `post-n`, `content-n`, three chapters, audio in English. */
export const request = (
    n: number,
    overrides: Partial<DownloadStartRequest> = {},
): DownloadStartRequest => ({
    downloadId: `d${n}`,
    parentId: `post-${n}`,
    parentType: "post",
    source: { masterUrl: "https://cdn.example.org/m.m3u8", artworkUrls: [] },
    selection: { kind: "audio", audioLanguage: "en" },
    chapterIndices: [0, 1, 2],
    content: {
        title: `Item ${n}`,
        contentId: `content-${n}`,
        language: "lang-eng",
        slug: `item-${n}`,
        memberOf: ["group-public"],
        durationSeconds: 0,
    },
    texts: { title: `Item ${n}` },
    volumeId: "internal",
    meteredConsent: false,
    expiresAt: null,
    ...overrides,
});

const services: DownloadsRuntime[] = [];

/** Disposes every service a test made. */
export function disposeServices() {
    services.splice(0).forEach((service) => service.dispose());
}

/** A service over the fake engine, the mount options that provide it, and the notification store it tells. */
export async function setupUi(options: FakeEngineOptions = {}) {
    setActivePinia(createPinia());
    const fake = createFakeEngine(options);
    const helpers = makeDeps();
    helpers.docs.set("post-1", makeParent());
    for (const n of [1, 2, 3]) {
        helpers.docs.set(
            `content-${n}`,
            makeContent({ _id: `content-${n}`, parentId: `post-${n}`, slug: `item-${n}` }),
        );
    }
    const service = createDownloadsService(fake, helpers.deps);
    services.push(service);
    await service.whenReady;
    const global = {
        provide: { [DownloadsKey as symbol]: service },
        stubs: { RouterLink: RouterLinkStub, BasePage: { template: "<div><slot /></div>" } },
    };
    return { fake, service, global, notifications: useNotificationStore(), ...helpers };
}

/** Starts item `n` and runs it to the end. */
export async function downloaded(fake: ReturnType<typeof createFakeEngine>, n: number) {
    await fake.start(request(n));
    for (let i = 0; i < 4; i++) fake.tick();
}

/** Lets pending promise callbacks and the renders they cause run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
