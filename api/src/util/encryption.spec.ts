import { encrypt, decrypt, encryptObject, decryptObject, resetEncryptionKey } from "./encryption";
import { S3CredentialDto } from "../dto/S3CredentialDto";

describe("Encryption", () => {
    const mockEncryptionKey = "test-encryption-key-for-testing";

    beforeEach(() => {
        // Reset the encryption key before each test
        resetEncryptionKey();
        process.env.ENCRYPTION_KEY = mockEncryptionKey;
    });

    afterEach(() => {
        // Clean up environment
        delete process.env.ENCRYPTION_KEY;
        resetEncryptionKey();
    });

    it("should encrypt and decrypt strings correctly", async () => {
        const plaintext = "Hello, World!";
        const encrypted = await encrypt(plaintext);
        const decrypted = await decrypt(encrypted);

        expect(decrypted).toBe(plaintext);
        expect(encrypted).not.toBe(plaintext);
        expect(encrypted.length).toBeGreaterThan(plaintext.length);
    });

    it("should encrypt and decrypt S3 credentials correctly", async () => {
        const credentials: S3CredentialDto = {
            endpoint: "https://minio.example.com",
            accessKey: "test-access-key",
            secretKey: "test-secret-key",
        };

        const encrypted = await encryptObject(credentials);
        const decrypted = await decryptObject<S3CredentialDto>(encrypted);

        expect(decrypted).toEqual(credentials);
        expect(encrypted).not.toContain(credentials.accessKey);
        expect(encrypted).not.toContain(credentials.secretKey);
    });

    it("should produce different encrypted outputs for the same input", async () => {
        const plaintext = "test data";
        const encrypted1 = await encrypt(plaintext);
        const encrypted2 = await encrypt(plaintext);

        // Should be different due to random IV
        expect(encrypted1).not.toBe(encrypted2);

        // But should decrypt to the same value
        const decrypted1 = await decrypt(encrypted1);
        const decrypted2 = await decrypt(encrypted2);
        expect(decrypted1).toBe(plaintext);
        expect(decrypted2).toBe(plaintext);
    });

    it("should throw an error when trying to decrypt invalid data", async () => {
        await expect(decrypt("invalid-base64-data")).rejects.toThrow();
    });

    it("should throw an error when the key is missing", async () => {
        delete process.env.ENCRYPTION_KEY;
        resetEncryptionKey();

        await expect(encrypt("test")).rejects.toThrow("Encryption key is required for encryption");
    });

    it("should handle encryption key reset correctly", async () => {
        const plaintext = "test message";

        // Encrypt with first key
        const encrypted = await encrypt(plaintext);

        // Reset and set new secret
        resetEncryptionKey();
        process.env.ENCRYPTION_KEY = "different-encryption-key";

        // Should still be able to encrypt new data
        const newEncrypted = await encrypt(plaintext);
        expect(newEncrypted).not.toBe(encrypted);
    });

    it("should handle empty string encryption", async () => {
        const plaintext = "";
        const encrypted = await encrypt(plaintext);
        const decrypted = await decrypt(encrypted);

        expect(decrypted).toBe(plaintext);
        expect(encrypted).not.toBe(plaintext);
    });

    it("should handle complex object encryption", async () => {
        const complexObject = {
            nested: {
                data: "value",
                number: 42,
                boolean: true,
            },
            array: [1, 2, 3],
            nullValue: null,
        };

        const encrypted = await encryptObject(complexObject);
        const decrypted = await decryptObject(encrypted);

        expect(decrypted).toEqual(complexObject);
        expect(typeof encrypted).toBe("string");
    });

    it("should decrypt an object encrypted correctly", async () => {
        const originalObject = {
            key1: "value1",
            key2: 123,
            key3: { nestedKey: "nestedValue" },
        };

        const encrypted = await encryptObject(originalObject);
        const decrypted = await decryptObject<typeof originalObject>(encrypted);

        expect(decrypted).toEqual(originalObject);
    });
});
