import { Auth0CredentialsDto } from "../dto/Auth0CredentialsDto";
import { OAuthProviderDto } from "../dto/OAuthProviderDto";
import { DbService } from "../db/db.service";
import { retrieveCryptoData, decryptObject } from "../util/encryption";
import { DocType } from "../enums";

/**
 * Service for managing OAuth provider configurations.
 */
export class OAuthProviderService {
    private static instances: Map<string, OAuthProviderService> = new Map();
    private static dbChangeListener: ((update: unknown) => void) | null = null;
    private credentials: Auth0CredentialsDto;
    private providerId: string;
    private label: string;

    /**
     * Initialize the database change listener for credential updates.
     * Should be called once when the application starts.
     */
    static initializeChangeListener(db: DbService): void {
        if (OAuthProviderService.dbChangeListener) {
            return;
        }

        OAuthProviderService.dbChangeListener = async (doc: unknown) => {
            const typedDoc = doc as { type?: DocType; _id?: string; data?: { encrypted?: string } };

            // Handle credential updates (CryptoDto changes)
            if (
                typedDoc &&
                typedDoc.type === DocType.Crypto &&
                typedDoc._id &&
                typedDoc.data?.encrypted
            ) {
                // Find any OAuthProviderService instances using this credential
                for (const [providerId, instance] of OAuthProviderService.instances.entries()) {
                    // We need to check if this credential belongs to this provider
                    // by comparing credential_id stored when the instance was created
                    if (instance.providerId === providerId) {
                        try {
                            const updatedCredentials = await decryptObject<Auth0CredentialsDto>(
                                typedDoc.data.encrypted,
                            );
                            instance.credentials = updatedCredentials;
                        } catch (error) {
                            console.error(
                                `Failed to update OAuth credentials for provider ${providerId}:`,
                                error,
                            );
                        }
                    }
                }
            }

            // Handle provider deletions
            if (typedDoc && typedDoc.type === DocType.DeleteCmd) {
                const deleteDoc = typedDoc as { docType?: DocType; docId?: string };
                if (deleteDoc.docType === DocType.OAuthProvider && deleteDoc.docId) {
                    OAuthProviderService.instances.delete(deleteDoc.docId);
                }
            }
        };

        db.on("update", OAuthProviderService.dbChangeListener);
    }

    /**
     * Gets or creates an OAuthProviderService instance for the specified provider.
     * Uses singleton pattern to reuse existing instances.
     */
    static async create(providerId: string, db: DbService): Promise<OAuthProviderService> {
        // Return existing instance if available
        if (OAuthProviderService.instances.has(providerId)) {
            return OAuthProviderService.instances.get(providerId)!;
        }

        // Create new instance
        const service = new OAuthProviderService();
        service.providerId = providerId;

        // Get provider configuration
        const result = await db.getDoc(providerId);
        if (!result.docs || result.docs.length === 0) {
            throw new Error(`OAuth provider with ID ${providerId} not found`);
        }

        const provider = result.docs[0] as OAuthProviderDto;
        service.label = provider.label;

        // Credentials are stored encrypted via credential_id reference
        if (!provider.credential_id) {
            throw new Error(`No credentials configured for OAuth provider: ${provider.label}`);
        }

        // Retrieve and decrypt credentials
        const credentials = await retrieveCryptoData<Auth0CredentialsDto>(
            db,
            provider.credential_id,
        );
        service.credentials = credentials;

        // Store instance in cache
        OAuthProviderService.instances.set(providerId, service);

        return service;
    }

    /**
     * Gets an OAuth provider by its label.
     */
    static async getByLabel(label: string, db: DbService): Promise<OAuthProviderService> {
        const result = await db.getDocsByType(DocType.OAuthProvider);

        if (!result.docs || result.docs.length === 0) {
            throw new Error("No OAuth providers configured");
        }

        const providers = result.docs as OAuthProviderDto[];
        const provider = providers.find((p) => p.label === label);

        if (!provider) {
            throw new Error(`OAuth provider with label "${label}" not found`);
        }

        return OAuthProviderService.create(provider._id, db);
    }

    /**
     * Clears the instance cache. Useful for testing or when credentials change.
     */
    static clearCache(providerId?: string): void {
        if (providerId) {
            OAuthProviderService.instances.delete(providerId);
        } else {
            OAuthProviderService.instances.clear();
        }
    }

    /**
     * Check if an instance exists for a given provider ID. Useful for testing.
     */
    static hasInstance(providerId: string): boolean {
        return OAuthProviderService.instances.has(providerId);
    }

    /**
     * Get the decrypted credentials.
     * The secret stays in memory only - never logged or exposed.
     */
    getCredentials(): Auth0CredentialsDto {
        return this.credentials;
    }
}
