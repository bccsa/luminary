import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import {
    AUTH_FAILURE_MESSAGE,
    AuthFailureReason,
    AuthIdentityService,
} from "../auth/authIdentity.service";

/**
 * Auth for the `/live` stream. Unlike the REST AuthGuard it puts the coarse failure reason in the
 * 401 body, because the client can't read headers/status detail from a stream and evicts its cached
 * provider based on that code.
 */
@Injectable()
export class ChangeFeedAuthGuard implements CanActivate {
    constructor(private authIdentityService: AuthIdentityService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        const bearer = type === "Bearer" ? token : undefined;
        const providerId = request.headers["x-auth-provider-id"] as string | undefined;

        // A token without a providerId is inconsistent client state: force provider re-selection
        if (bearer && !providerId) this.reject("provider_not_found");

        try {
            const result = await this.authIdentityService.resolveOrDefault(bearer, providerId);
            request.user = result.userDetails;
            return true;
        } catch (error) {
            this.reject((error as { reason?: AuthFailureReason })?.reason ?? "token_invalid");
        }
    }

    private reject(reason: AuthFailureReason): never {
        throw new UnauthorizedException({
            type: "auth_failed",
            reason,
            message: AUTH_FAILURE_MESSAGE,
        });
    }
}
