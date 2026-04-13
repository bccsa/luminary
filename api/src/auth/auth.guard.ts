import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthIdentityService, JwtUserDetails } from "./authIdentity.service";

declare module "fastify" {
    interface FastifyRequest {
        user?: JwtUserDetails;
    }
}

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private authIdentityService: AuthIdentityService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const token = this.extractTokenFromHeader(request);
        if (!token) {
            throw new UnauthorizedException();
        }
        const providerId = request.headers["x-auth-provider-id"] as string;

        const result = await this.authIdentityService.resolveOrDefault(token, providerId);
        request.user = result.userDetails;
        return true;
    }

    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
