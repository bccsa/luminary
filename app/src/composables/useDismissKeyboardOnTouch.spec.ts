import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { useDismissKeyboardOnTouch } from "./useDismissKeyboardOnTouch";

const Host = defineComponent({
    setup() {
        useDismissKeyboardOnTouch();
        return () =>
            h("div", [
                h("div", { "data-keeps-keyboard": "" }, [
                    h("input", { "data-test": "field" }),
                    h("button", { "data-test": "clear" }),
                ]),
                h("input", { "data-test": "other" }),
                h("p", { "data-test": "empty" }, "Search anything"),
                h("a", { href: "/post", "data-test": "result" }, "A result"),
            ]);
    },
});

let wrapper: VueWrapper | undefined;
afterEach(() => wrapper?.unmount());

function setup() {
    wrapper = mount(Host, { attachTo: document.body });
    const el = (test: string) => wrapper!.find(`[data-test='${test}']`).element as HTMLElement;
    const field = el("field");
    field.focus();
    return { field, el };
}

const touch = (target: Element) => target.dispatchEvent(new Event("touchstart", { bubbles: true }));

describe("useDismissKeyboardOnTouch", () => {
    it("takes the focus off the field when a touch starts on an empty part of the page", () => {
        const { field, el } = setup();
        touch(el("empty"));
        expect(document.activeElement).not.toBe(field);
    });

    it("does the same on a link, which still opens as before", () => {
        const { field, el } = setup();
        touch(el("result"));
        expect(document.activeElement).not.toBe(field);
    });

    it("leaves the focus on the field for touches on the field itself and its own controls", () => {
        const { field, el } = setup();
        touch(field);
        expect(document.activeElement).toBe(field);
        touch(el("clear"));
        expect(document.activeElement).toBe(field);
    });

    it("leaves a touch on another field to move the focus itself", () => {
        const { field, el } = setup();
        touch(el("other"));
        expect(document.activeElement).toBe(field);
    });

    it("does nothing when no field is focused", () => {
        const { field, el } = setup();
        field.blur();
        const before = document.activeElement;
        touch(el("empty"));
        expect(document.activeElement).toBe(before);
    });

    it("stops listening once the app is gone", () => {
        const { field, el } = setup();
        const empty = el("empty");
        wrapper!.unmount();
        wrapper = undefined;
        document.body.appendChild(field);
        field.focus();
        touch(empty);
        expect(document.activeElement).toBe(field);
        field.remove();
    });
});
