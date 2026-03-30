import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthIdentityService } from "./authIdentity.service";
import { PermissionSystem } from "../permissions/permissions.service";

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private authIdentityService: AuthIdentityService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const token = this.extractTokenFromHeader(request);
        const providerId = request.headers["x-auth-provider-id"] as string;

        if (token && providerId) {
            try {
                const userDetails = await this.authIdentityService.resolveIdentity(token, providerId);
                (request as any)["user"] = userDetails;
            } catch {
                const defaultGroups = await this.authIdentityService.getDefaultGroups();
                (request as any)["user"] = {
                    groups: defaultGroups,
                    accessMap: PermissionSystem.getAccessMap(defaultGroups),
                };
            }
        } else {
            const defaultGroups = await this.authIdentityService.getDefaultGroups();
            (request as any)["user"] = {
                groups: defaultGroups,
                accessMap: PermissionSystem.getAccessMap(defaultGroups),
            };
        }
        return true;
    }

    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
