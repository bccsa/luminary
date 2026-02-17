import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import * as JWT from "jsonwebtoken";
import { DbService } from "../db/db.service";
import { DocType } from "../enums";

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private dbService: DbService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const token = this.extractTokenFromHeader(request);
        if (!token) {
            throw new UnauthorizedException();
        }

        const providerId = request.headers["x-provider-id"] as string | undefined;

        if (providerId) {
            // OIDC path: validate provider exists in DB, then decode without verification
            try {
                const providerResult = await this.dbService.getDoc(providerId);
                const provider = providerResult.docs?.[0];

                if (!provider || provider.type !== DocType.OAuthProvider) {
                    throw new UnauthorizedException("Untrusted provider");
                }

                const decoded = JWT.decode(token);
                if (!decoded || typeof decoded !== "object") {
                    throw new UnauthorizedException();
                }

                (request as any)["user"] = decoded;
            } catch (err) {
                if (err instanceof UnauthorizedException) throw err;
                throw new UnauthorizedException();
            }
        } else {
            // Legacy path: verify with JWT_SECRET ?? We need this for the CMS to work - as we don't have multiple provider support for for the CMS yet.
            try {
                const payload = JWT.verify(token, process.env.JWT_SECRET);
                (request as any)["user"] = payload;
            } catch {
                throw new UnauthorizedException();
            }
        }

        return true;
    }

    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
