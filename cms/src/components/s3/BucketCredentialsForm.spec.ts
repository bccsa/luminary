import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BucketCredentialsForm from "./BucketCredentialsForm.vue";
import type { S3CredentialDto } from "luminary-shared";
import LInput from "../forms/LInput.vue";

describe("BucketCredentialsForm", () => {
    const mockCredentials: S3CredentialDto = {
        endpoint: "http://localhost:9000",
        bucketName: "test-bucket",
        accessKey: "testAccessKey",
        secretKey: "testSecretKey",
    };

    const defaultProps = {
        credentials: mockCredentials,
        isLoading: false,
        isEditing: false,
        hasFieldError: vi.fn(() => false),
        touchField: vi.fn(),
    };

    it("renders all credential input fields", () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: defaultProps,
        });

        expect(wrapper.find("#bucket-endpoint").exists()).toBe(true);
        expect(wrapper.find("#s3-bucket-name").exists()).toBe(true);
        expect(wrapper.find("#bucket-access-key").exists()).toBe(true);
        expect(wrapper.find("#bucket-secret-key").exists()).toBe(true);
    });

    it("displays correct title and description for new bucket", () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: { ...defaultProps, isEditing: false },
        });

        expect(wrapper.text()).toContain("S3 Credentials");
        expect(wrapper.text()).toContain("Provide your S3-compatible storage credentials");
    });

    it("displays correct description for editing bucket", () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: { ...defaultProps, isEditing: true },
        });

        expect(wrapper.text()).toContain("Update the S3 credentials for this bucket");
        expect(wrapper.text()).toContain("Leave all fields empty to keep existing credentials");
    });

    it("displays credential values from props", () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: defaultProps,
        });

        const inputs = wrapper.findAllComponents(LInput);
        
        // Endpoint
        expect(inputs[0].props("modelValue")).toBe("http://localhost:9000");
        
        // Bucket Name
        expect(inputs[1].props("modelValue")).toBe("test-bucket");
        
        // Access Key
        expect(inputs[2].props("modelValue")).toBe("testAccessKey");
        
        // Secret Key
        expect(inputs[3].props("modelValue")).toBe("testSecretKey");
    });

    it("emits update:credentials when endpoint changes", async () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: defaultProps,
        });

        const endpointInput = wrapper.findAllComponents(LInput)[0];
        await endpointInput.vm.$emit("update:modelValue", "https://s3.amazonaws.com");

        expect(wrapper.emitted("update:credentials")).toBeTruthy();
        const emittedValue = wrapper.emitted("update:credentials")![0][0] as S3CredentialDto;
        expect(emittedValue.endpoint).toBe("https://s3.amazonaws.com");
        expect(emittedValue.bucketName).toBe("test-bucket"); // Other fields preserved
    });

    it("emits update:credentials when bucket name changes", async () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: defaultProps,
        });

        const bucketNameInput = wrapper.findAllComponents(LInput)[1];
        await bucketNameInput.vm.$emit("update:modelValue", "new-bucket-name");

        expect(wrapper.emitted("update:credentials")).toBeTruthy();
        const emittedValue = wrapper.emitted("update:credentials")![0][0] as S3CredentialDto;
        expect(emittedValue.bucketName).toBe("new-bucket-name");
    });

    it("emits update:credentials when access key changes", async () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: defaultProps,
        });

        const accessKeyInput = wrapper.findAllComponents(LInput)[2];
        await accessKeyInput.vm.$emit("update:modelValue", "newAccessKey123");

        expect(wrapper.emitted("update:credentials")).toBeTruthy();
        const emittedValue = wrapper.emitted("update:credentials")![0][0] as S3CredentialDto;
        expect(emittedValue.accessKey).toBe("newAccessKey123");
    });

    it("emits update:credentials when secret key changes", async () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: defaultProps,
        });

        const secretKeyInput = wrapper.findAllComponents(LInput)[3];
        await secretKeyInput.vm.$emit("update:modelValue", "newSecretKey456");

        expect(wrapper.emitted("update:credentials")).toBeTruthy();
        const emittedValue = wrapper.emitted("update:credentials")![0][0] as S3CredentialDto;
        expect(emittedValue.secretKey).toBe("newSecretKey456");
    });

    it("calls touchField when endpoint is blurred", async () => {
        const touchField = vi.fn();
        const wrapper = mount(BucketCredentialsForm, {
            props: { ...defaultProps, touchField },
        });

        const endpointInput = wrapper.findAllComponents(LInput)[0];
        await endpointInput.vm.$emit("blur");

        expect(touchField).toHaveBeenCalledWith("endpoint");
        expect(touchField).toHaveBeenCalledWith("endpointFormat");
    });

    it("calls touchField when bucket name is blurred", async () => {
        const touchField = vi.fn();
        const wrapper = mount(BucketCredentialsForm, {
            props: { ...defaultProps, touchField },
        });

        const bucketNameInput = wrapper.findAllComponents(LInput)[1];
        await bucketNameInput.vm.$emit("blur");

        expect(touchField).toHaveBeenCalledWith("bucketName");
    });

    it("calls touchField on input events", async () => {
        const touchField = vi.fn();
        const wrapper = mount(BucketCredentialsForm, {
            props: { ...defaultProps, touchField },
        });

        const accessKeyInput = wrapper.findAllComponents(LInput)[2];
        await accessKeyInput.vm.$emit("input");

        expect(touchField).toHaveBeenCalledWith("accessKey");
    });

    it("applies error styling when hasFieldError returns true", () => {
        const hasFieldError = vi.fn((fieldId: string) => fieldId === "endpoint");
        const wrapper = mount(BucketCredentialsForm, {
            props: { ...defaultProps, hasFieldError },
        });

        const endpointInput = wrapper.findAllComponents(LInput)[0];
        expect(endpointInput.classes()).toContain("border-red-300");
    });

    it("disables inputs when isLoading is true", () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: { ...defaultProps, isLoading: true },
        });

        const inputs = wrapper.findAllComponents(LInput);
        inputs.forEach((input) => {
            expect(input.props("disabled")).toBe(true);
        });
    });

    it("marks fields as required for new buckets", () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: { ...defaultProps, isEditing: false },
        });

        const inputs = wrapper.findAllComponents(LInput);
        inputs.forEach((input) => {
            expect(input.props("required")).toBe(true);
        });
    });

    it("marks fields as optional when editing", () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: { ...defaultProps, isEditing: true },
        });

        const inputs = wrapper.findAllComponents(LInput);
        inputs.forEach((input) => {
            expect(input.props("required")).toBe(false);
        });
    });

    it("preserves unchanged fields when updating a single field", async () => {
        const wrapper = mount(BucketCredentialsForm, {
            props: defaultProps,
        });

        const endpointInput = wrapper.findAllComponents(LInput)[0];
        await endpointInput.vm.$emit("update:modelValue", "https://new-endpoint.com");

        const emittedValue = wrapper.emitted("update:credentials")![0][0] as S3CredentialDto;
        
        // Updated field
        expect(emittedValue.endpoint).toBe("https://new-endpoint.com");
        
        // Preserved fields
        expect(emittedValue.bucketName).toBe("test-bucket");
        expect(emittedValue.accessKey).toBe("testAccessKey");
        expect(emittedValue.secretKey).toBe("testSecretKey");
    });

    it("handles empty credential values", () => {
        const emptyCredentials: S3CredentialDto = {
            endpoint: "",
            bucketName: "",
            accessKey: "",
            secretKey: "",
        };

        const wrapper = mount(BucketCredentialsForm, {
            props: { ...defaultProps, credentials: emptyCredentials },
        });

        const inputs = wrapper.findAllComponents(LInput);
        inputs.forEach((input) => {
            expect(input.props("modelValue")).toBe("");
        });
    });
});

