import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthIdentityService } from "./authIdentity.service";

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private authIdentityService: AuthIdentityService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const token = this.extractTokenFromHeader(request);
        const providerId = request.headers["x-auth-provider-id"] as string;

        const result = await this.authIdentityService.resolveOrDefault(token, providerId);
        (request as any)["user"] = result.userDetails;
        return true;
    }

    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
