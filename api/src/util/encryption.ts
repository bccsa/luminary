import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { CryptoDto } from "../dto/CryptoDto";
import { DbService } from "../db/db.service";

/**
 * Encryption utilities for sensitive data like S3 credentials.
 * Uses AES-256-CBC encryption with a key derived from the dedicated ENCRYPTION_KEY environment variable.
 *
 * The encrypted data format includes:
 * - IV (initialization vector) - 16 bytes for CBC
 * - Encrypted data - variable length
 */

const ALGORITHM = "aes-256-cbc";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for CBC

let encryptionKey: Buffer | null = null;

/**
 * Initialize encryption key from the ENCRYPTION_KEY environment variable.
 * Uses scrypt for key derivation to ensure proper key length and entropy.
 */
async function initializeKey(): Promise<void> {
    const encryptionSecret = process.env.ENCRYPTION_KEY;

    if (!encryptionSecret) {
        throw new Error("Encryption key is required for encryption");
    }

    // Use a fixed salt for key derivation to ensure consistency
    // This ensures the same key is derived from the same ENCRYPTION_KEY
    const salt = "luminary-encryption-salt";
    const scryptAsync = promisify(scrypt);

    encryptionKey = (await scryptAsync(encryptionSecret, salt, KEY_LENGTH)) as Buffer;
}

/**
 * Encrypt a plain text string and return base64 encoded result.
 * The result contains IV + encrypted data, all base64 encoded.
 */
export async function encrypt(plaintext: string): Promise<string> {
    if (!encryptionKey) {
        await initializeKey();
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, new Uint8Array(encryptionKey!), new Uint8Array(iv));

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Combine IV + encrypted data
    const combined = iv.toString("hex") + encrypted;

    return Buffer.from(combined, "hex").toString("base64");
}

/**
 * Decrypt a base64 encoded string that was encrypted with encrypt().
 * Expects format: IV + encrypted data (all base64 decoded then hex decoded).
 */
export async function decrypt(encryptedData: string): Promise<string> {
    if (!encryptionKey) {
        await initializeKey();
    }

    const combined = Buffer.from(encryptedData, "base64").toString("hex");

    // Extract components
    const ivHex = combined.substr(0, IV_LENGTH * 2); // IV is hex encoded
    const encryptedHex = combined.substr(IV_LENGTH * 2);

    const iv = Buffer.from(ivHex, "hex");
    const decipher = createDecipheriv(
        ALGORITHM,
        new Uint8Array(encryptionKey!),
        new Uint8Array(iv),
    );

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}

/**
 * Encrypt a JSON object (like S3CredentialDto) and return base64 string.
 */
export async function encryptObject<T>(obj: T): Promise<string> {
    // require initialization
    if (!encryptionKey) {
        await initializeKey();
    }

    const jsonString = JSON.stringify(obj);
    return encrypt(jsonString);
}

/**
 * Decrypt a base64 string and parse it as JSON.
 */
export async function decryptObject<T>(encryptedData: string): Promise<T> {
    const jsonString = await decrypt(encryptedData);
    return JSON.parse(jsonString) as T;
}

/**
 * Reset the cached encryption key.
 * Useful for testing or when secret changes.
 */
export function resetEncryptionKey(): void {
    encryptionKey = null;
}

/**
 * Store data encrypted in a CryptoDto and return the saved document id.
 */
export async function storeCryptoData<T>(db: DbService, data: T): Promise<string> {
    if (!encryptionKey) {
        await initializeKey();
    }

    if (!data) throw new Error("No data provided");

    // Encrypt the whole data object as a single payload. This is simpler
    // and future-proof (adds/changes fields without changing storage format).
    const encryptedPayload = await encryptObject(data);

    // Create encrypted storage document
    const storageDoc = new CryptoDto();
    storageDoc._id = uuidv4();
    storageDoc.data = {
        encrypted: encryptedPayload,
    };

    // Save and return id
    const saved = await db.upsertDoc(storageDoc);

    // Return the saved document id for reference
    return saved.id;
}

/**
 * Retrieve and decrypt data by document id.
 */
export async function retrieveCryptoData<T>(db: DbService, dataId: string): Promise<T> {
    // require initialization
    if (!encryptionKey) {
        await initializeKey();
    }

    const storageResult = await db.getDoc(dataId);

    if (!storageResult.docs || storageResult.docs.length === 0) {
        throw new Error(`Data not found for id: ${dataId}`);
    }

    const storageDoc = storageResult.docs[0];

    if (!storageDoc.data || !storageDoc.data.encrypted) {
        throw new Error(`Invalid encrypted data format for id: ${dataId}`);
    }

    const decrypted = await decryptObject<T>(storageDoc.data.encrypted);

    return decrypted;
}
