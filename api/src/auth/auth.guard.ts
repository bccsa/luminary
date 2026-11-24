import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { JwtUserDetails } from "./authIdentity.service";
import { IdentityCacheService } from "./identityCache.service";
import { ConfigService } from "@nestjs/config";
import { resolveRequestIdentity, type RequestIdentity } from "./requestContext";

declare module "fastify" {
    interface FastifyRequest {
        user?: JwtUserDetails;
        authIdentity: RequestIdentity;
    }
}

@Injectable()
export class AuthGuard implements CanActivate {
    // Resolves through the identity cache, which the socket handshake shares.
    constructor(
        private identityCacheService: IdentityCacheService,
        private readonly config: ConfigService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const token = this.extractTokenFromHeader(request);
        const providerId = request.headers["x-auth-provider-id"] as string;

        const result = await this.identityCacheService.resolveOrDefault(token, providerId);
        request.user = result.userDetails;
        request.authIdentity = resolveRequestIdentity(
            result,
            request.ip,
            this.config.get<string>("userData.idSecret"),
        );
        return true;
    }

    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
