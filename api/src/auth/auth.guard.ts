import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { JwtUserDetails } from "./authIdentity.service";
import { IdentityCacheService } from "./identityCache.service";
import { span, traceMeta } from "../util/perfTrace";

declare module "fastify" {
    interface FastifyRequest {
        user?: JwtUserDetails;
    }
}

@Injectable()
export class AuthGuard implements CanActivate {
    // Resolves through the identity cache, which the socket handshake shares.
    constructor(private identityCacheService: IdentityCacheService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const token = this.extractTokenFromHeader(request);
        const providerId = request.headers["x-auth-provider-id"] as string;

        const result = await span("auth", () =>
            this.identityCacheService.resolveOrDefault(token, providerId),
        );
        request.user = result.userDetails;
        traceMeta({
            authenticated: !!result.userDetails?.userId,
            groups: result.userDetails?.groups?.length ?? 0,
        });
        return true;
    }

    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
