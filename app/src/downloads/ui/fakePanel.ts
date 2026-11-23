import { createApp } from "vue";
import type { FakeEngine } from "../fakeEngine";
import FakeDownloadsPanel from "./FakeDownloadsPanel.vue";

/** Development only: shows the fake engine's sheet in a corner of the page, outside the app's own tree. */
export function mountFakeDownloadsPanel(engine: FakeEngine): () => void {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const panel = createApp(FakeDownloadsPanel, { engine });
    panel.mount(host);
    return () => {
        panel.unmount();
        host.remove();
    };
}
