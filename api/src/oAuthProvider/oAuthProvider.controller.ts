import { Controller, Get } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { DocType } from "../enums";
import { OAuthProviderDto } from "../dto/OAuthProviderDto";
import { OAuthProviderService } from "./oAuthProvider.service";

export type OAuthProviderPublicDto = {
    id: string;
    label: string;
    domain: string;
    clientId: string;
    audience: string;
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

                publicProviders.push({
                    id: provider._id,
                    label: provider.label,
                    domain: credentials.domain,
                    clientId: credentials.clientId,
                    audience: credentials.audience,
                });
            } catch {
                // Skip providers with invalid credentials
            }
        }

        return publicProviders;
    }
}
