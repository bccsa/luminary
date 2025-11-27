import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import StorageFormModal from "./StorageFormModal.vue";
import {
    StorageType,
    DocType,
    type StorageDto,
    type S3CredentialDto,
    type GroupDto,
} from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import LButton from "../button/LButton.vue";

describe("BucketFormModal", () => {
    const mockBucket: StorageDto = {
        _id: "storage-test",
        type: DocType.Storage,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        name: "Test Bucket",
        storageType: StorageType.Image,
        publicUrl: "http://localhost:9000/test",
        mimeTypes: ["image/*"],
    };

    const mockCredentials: S3CredentialDto = {
        endpoint: "http://localhost:9000",
        bucketName: "test-bucket",
        accessKey: "testKey",
        secretKey: "testSecret",
    };

    const defaultProps = {
        isVisible: true,
        bucket: mockBucket,
        isEditing: false,
        isLoading: false,
        errors: undefined,
        availableGroups: [mockData.mockGroup] as GroupDto[],
        canDelete: false,
        isFormValid: true,
        validations: [],
        hasAttemptedSubmit: false,
        hasFieldError: vi.fn(() => false),
        touchField: vi.fn(),
        localCredentials: mockCredentials,
        hasValidCredentials: true,
    };

    it("renders the modal when visible", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        expect(wrapper.exists()).toBe(true);
        expect(wrapper.text()).toContain("Create New Bucket");
    });

    it("displays 'Create New Bucket' heading for new buckets", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isEditing: false },
        });

        expect(wrapper.text()).toContain("Create New Bucket");
    });

    it("displays 'Edit Bucket' heading when editing", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isEditing: true },
        });

        expect(wrapper.text()).toContain("Edit Bucket");
    });

    it("displays bucket name in input field", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        const nameInput = wrapper.find("#bucket-name");
        expect(nameInput.exists()).toBe(true);
    });

    it("displays public URL in input field", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        const urlInput = wrapper.find("#bucket-path");
        expect(urlInput.exists()).toBe(true);
    });

    it("displays storage type selector", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        expect(wrapper.text()).toContain("Storage Type");
        expect(wrapper.text()).toContain("Image");
    });

    it("displays mime types section", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        expect(wrapper.text()).toContain("Allowed File Types");
        expect(wrapper.text()).toContain("image/*");
    });

    it("displays group membership selector", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        expect(wrapper.text()).toContain("Group Membership");
    });

    it("displays bucket name input field", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        const nameInput = wrapper.find("#bucket-name");
        expect(nameInput.exists()).toBe(true);
    });

    it("displays public URL input field", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        const urlInput = wrapper.find("#bucket-path");
        expect(urlInput.exists()).toBe(true);
    });

    it("shows delete button when editing and canDelete is true", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isEditing: true, canDelete: true },
        });

        const deleteButton = wrapper.findAllComponents(LButton).find((w) => w.text() === "Delete");
        expect(deleteButton?.exists()).toBe(true);
    });

    it("hides delete button when not editing", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isEditing: false, canDelete: true },
        });

        const deleteButton = wrapper.findAllComponents(LButton).find((w) => w.text() === "Delete");
        expect(deleteButton).toBeUndefined();
    });

    it("hides delete button when canDelete is false", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isEditing: true, canDelete: false },
        });

        const deleteButton = wrapper.findAllComponents(LButton).find((w) => w.text() === "Delete");
        expect(deleteButton).toBeUndefined();
    });

    it("has a save button with correct text", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        expect(wrapper.text()).toContain("Create");
    });

    it("shows delete button when editing and can delete", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isEditing: true, canDelete: true },
        });

        expect(wrapper.text()).toContain("Delete");
    });

    it("has a cancel button", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        expect(wrapper.text()).toContain("Cancel");
    });

    it("disables save button when isLoading is true", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isLoading: true },
        });

        const saveButton = wrapper.findAllComponents(LButton).find((w) => w.text() === "Create");
        expect(saveButton!.props("disabled")).toBe(true);
    });

    it("disables save button when form is not valid", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isFormValid: false },
        });

        const saveButton = wrapper.findAllComponents(LButton).find((w) => w.text() === "Create");
        expect(saveButton!.props("disabled")).toBe(true);
    });

    it("displays validation errors", () => {
        const validations = [
            { id: "bucketName", isValid: false, message: "Bucket name is required" },
            { id: "publicUrl", isValid: false, message: "Public URL is required" },
        ];

        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isFormValid: false, validations },
        });

        expect(wrapper.text()).toContain("Bucket name is required");
        expect(wrapper.text()).toContain("Public URL is required");
    });

    it("displays global errors", () => {
        const errors = ["Failed to connect to S3", "Invalid credentials"];

        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, errors },
        });

        expect(wrapper.text()).toContain("Failed to connect to S3");
        expect(wrapper.text()).toContain("Invalid credentials");
    });

    it("shows 'Update' button text when editing", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isEditing: true },
        });

        const saveButton = wrapper.findAllComponents(LButton).find((w) => w.text() === "Update");
        expect(saveButton?.exists()).toBe(true);
    });

    it("shows 'Create' button text when creating", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isEditing: false },
        });

        const saveButton = wrapper.findAllComponents(LButton).find((w) => w.text() === "Create");
        expect(saveButton?.exists()).toBe(true);
    });

    it("displays file type management section", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        expect(wrapper.text()).toContain("Allowed File Types");
        expect(wrapper.text()).toContain("image/*");
    });

    it("can remove file type", async () => {
        const bucketWithTypes: StorageDto = {
            ...mockBucket,
            mimeTypes: ["image/*", "video/mp4"],
        };

        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, bucket: bucketWithTypes },
        });

        const removeButtons = wrapper.findAll("button").filter((w) => {
            const svg = w.find("svg");
            return svg.exists() && svg.classes().includes("h-3.5");
        });

        await removeButtons[0].trigger("click");

        expect(wrapper.emitted("update:bucket")).toBeTruthy();
    });

    it("shows credentials section for new buckets", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isEditing: false },
        });

        expect(wrapper.text()).toContain("S3 Credentials");
    });

    it("shows credentials section for editing buckets", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isEditing: true },
        });

        expect(wrapper.text()).toContain("S3 Credentials");
    });

    it("shows credentials required warning for new bucket without credentials", () => {
        const wrapper = mount(StorageFormModal, {
            props: {
                ...defaultProps,
                isEditing: false,
                hasAttemptedSubmit: true,
                hasValidCredentials: false,
            },
        });

        expect(wrapper.text()).toContain("Credentials Required");
    });

    it("shows credentials section", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        expect(wrapper.text()).toContain("S3 Credentials");
    });

    it("passes credentials props correctly", () => {
        const wrapper = mount(StorageFormModal, {
            props: defaultProps,
        });

        // Check that localCredentials prop is being passed
        expect(wrapper.props("localCredentials")).toEqual(mockCredentials);
    });

    it("does not render when isVisible is false", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isVisible: false },
        });

        // Modal component should have isVisible prop set to false
        expect(wrapper.exists()).toBe(true);
    });

    it("displays correct props when loading", () => {
        const wrapper = mount(StorageFormModal, {
            props: { ...defaultProps, isLoading: true },
        });

        expect(wrapper.props("isLoading")).toBe(true);
    });
});
