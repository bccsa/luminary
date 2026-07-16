import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { JwtUserDetails } from "./authIdentity.service";
import { IdentityCacheService } from "./identityCache.service";

declare module "fastify" {
    interface FastifyRequest {
        user?: JwtUserDetails;
    }
}

@Injectable()
export class AuthGuard implements CanActivate {
    // Resolve through the identity cache (transport-agnostic; a pure passthrough to
    // AuthIdentityService.resolveOrDefault when the cache is disabled).
    constructor(private identityCacheService: IdentityCacheService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const token = this.extractTokenFromHeader(request);
        const providerId = request.headers["x-auth-provider-id"] as string;

        const result = await this.identityCacheService.resolveOrDefault(token, providerId);
        request.user = result.userDetails;
        return true;
    }

    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
