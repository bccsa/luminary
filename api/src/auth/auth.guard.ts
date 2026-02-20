import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import * as JWT from "jsonwebtoken";
import { OAuthProviderCache } from "./oauthProviderCache";

@Injectable()
export class AuthGuard implements CanActivate {

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const token = this.extractTokenFromHeader(request);
        if (!token) {
            throw new UnauthorizedException();
        }

        try {
            const decoded = JWT.decode(token, { complete: true });
            if (!decoded?.payload || typeof decoded.payload === "string") {
                throw new UnauthorizedException();
            }

            const iss = (decoded.payload as JWT.JwtPayload).iss;
            if (!iss) throw new UnauthorizedException();

            const provider = OAuthProviderCache.getByIssuer(iss);
            if (!provider) throw new UnauthorizedException();

            const kid = decoded.header?.kid;
            const pem = OAuthProviderCache.getSigningKey(provider, kid);
            if (!pem) throw new UnauthorizedException();

            const payload = JWT.verify(token, pem, { algorithms: ["RS256"] });
            (request as any)["user"] = payload;
        } catch {
            throw new UnauthorizedException();
        }

        return true;
    }

    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
