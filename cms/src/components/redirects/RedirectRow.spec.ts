import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import RedirectRow from "./RedirectRow.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db } from "luminary-shared";
import { fullAccessToAllContentMap, mockRedirectDto } from "@/tests/mockdata";
import { DateTime } from "luxon";

describe("RedirectRow.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = fullAccessToAllContentMap;
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("should display the passed redirect", async () => {
        const wrapper = mount(RedirectRow, {
            props: {
                redirectDoc: mockRedirectDto,
            },
        });

        expect(wrapper.html()).toContain("vod");
        expect(wrapper.html()).toContain("LIVE");

        // check if the updated time is formatted correctly according the systems settings
        expect(wrapper.html()).toContain(
            db.toDateTime(mockRedirectDto.updatedTimeUtc).toLocaleString(DateTime.DATETIME_SHORT),
        );
    });
});
