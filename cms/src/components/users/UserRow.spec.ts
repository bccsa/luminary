import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import UserRow from "./UserRow.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db } from "luminary-shared";
import { fullAccessToAllContentMap, mockGroupDtoSuperAdmins, mockUserDto } from "@/tests/mockdata";
import { DateTime } from "luxon";

describe("UserRow.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = fullAccessToAllContentMap;
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("should display the passed user", async () => {
        await db.docs.bulkPut([mockGroupDtoSuperAdmins]);

        const wrapper = mount(UserRow, {
            props: {
                usersDoc: mockUserDto,
                groups: [mockGroupDtoSuperAdmins],
            },
        });

        await wrapper.vm.$nextTick();

        expect(wrapper.html()).toContain("John Doe");
        expect(wrapper.html()).toContain("john@doe.com");

        // check if the updated time is formatted correctly according the systems settings
        expect(wrapper.html()).toContain(
            db.toDateTime(mockUserDto.lastLogin!).toLocaleString(DateTime.DATETIME_SHORT),
        );
    });
});
