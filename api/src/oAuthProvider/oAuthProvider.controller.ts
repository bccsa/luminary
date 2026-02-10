import { Controller, Get } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { DocType } from "../enums";
import { OAuthProviderDto } from "../dto/OAuthProviderDto";
import { OAuthProviderService } from "./oAuthProvider.service";
import { StorageDto } from "../dto/StorageDto";

export type OAuthProviderPublicDto = {
    id: string;
    label: string;
    domain: string;
    clientId: string;
    audience: string;
    icon?: string;
};

@Controller("oauth")
export class OAuthProviderController {
    constructor(private readonly dbService: DbService) {}

    /**
     * Public endpoint to fetch available OAuth providers.
     * Returns only public fields (no clientSecret).
     */
    @Get("providers")
    async getProviders(): Promise<OAuthProviderPublicDto[]> {
        const result = await this.dbService.getDocsByType(DocType.OAuthProvider);

        if (!result.docs || result.docs.length === 0) {
            return [];
        }

        const providers = result.docs as OAuthProviderDto[];
        const publicProviders: OAuthProviderPublicDto[] = [];

        for (const provider of providers) {
            if (!provider.credential_id) {
                continue;
            }

            try {
                const service = await OAuthProviderService.create(provider._id, this.dbService);
                const credentials = service.getCredentials();

                let icon: string | undefined;
                if (provider.imageData && provider.imageBucketId) {
                    try {
                        const result = await this.dbService.getDoc(provider.imageBucketId);
                        if (result.docs && result.docs.length > 0) {
                            const bucket = result.docs[0] as StorageDto;

                            if (bucket && bucket.publicUrl) {
                                // Prefer uploadData as it's the raw file usually used for icons/simple uploads
                                // But ImageEditor might process it into fileCollections. Check both.
                                let filename: string | undefined;

                                if (
                                    provider.imageData.uploadData &&
                                    provider.imageData.uploadData.length > 0
                                ) {
                                    filename = provider.imageData.uploadData[0].filename;
                                } else if (
                                    provider.imageData.fileCollections &&
                                    provider.imageData.fileCollections.length > 0 &&
                                    provider.imageData.fileCollections[0].imageFiles.length > 0
                                ) {
                                    // Just grab the first available file if no uploadData
                                    filename =
                                        provider.imageData.fileCollections[0].imageFiles[0]
                                            .filename;
                                }

                                if (filename) {
                                    // Ensure publicUrl ends with / and filename doesn't start with /
                                    const baseUrl = bucket.publicUrl.replace(/\/$/, "");
                                    const safeFilename = filename.replace(/^\//, "");
                                    icon = `${baseUrl}/${safeFilename}`;
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore image resolution errors
                    }
                }

                publicProviders.push({
                    id: provider._id,
                    label: provider.label,
                    domain: credentials.domain,
                    clientId: credentials.clientId,
                    audience: credentials.audience,
                    icon,
                });
            } catch {
                // Skip providers with invalid credentials
            }
        }

        return publicProviders;
    }
}
