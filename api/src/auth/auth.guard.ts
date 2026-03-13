import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthIdentityService } from "./authIdentity.service";

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);

    constructor(private authIdentityService: AuthIdentityService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const token = this.extractTokenFromHeader(request);
        const providerId = request.headers["x-auth-provider-id"] as string;

        if (!token || !providerId) {
            if (!providerId) this.logger.warn("Missing x-auth-provider-id header");
            throw new UnauthorizedException();
        }

        const userDetails = await this.authIdentityService.resolveIdentity(token, providerId);
        (request as any)["user"] = userDetails;
        return true;
    }

    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
