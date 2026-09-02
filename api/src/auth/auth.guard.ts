import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthIdentityService, JwtUserDetails } from "./authIdentity.service";
import { span, traceMeta } from "../util/perfTrace";

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
        const providerId = request.headers["x-auth-provider-id"] as string;

        const result = await span("auth", () =>
            this.authIdentityService.resolveOrDefault(token, providerId),
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
