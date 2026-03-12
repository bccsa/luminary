import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import * as jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import { DbService } from "../db/db.service";
import { DocType } from "../enums";
import { OAuthProviderDto } from "../dto/OAuthProviderDto";
import { AuthIdentityService, ResolvedIdentity } from "./auth-identity.service";
import { UserDto } from "../dto/UserDto";

const GUEST_GROUP_ID = "group-public-users";

const GUEST_IDENTITY: ResolvedIdentity = {
    user: { _id: "guest", type: DocType.User, email: "", name: "Guest", memberOf: [] } as UserDto,
    groupIds: [GUEST_GROUP_ID],
};

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private db: DbService,
        private identity: AuthIdentityService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();

        const token = this.extractTokenFromHeader(request);

        // No token → guest access (mirrors socket.io gateway behaviour)
        if (!token) {
            (request as any)["user"] = GUEST_IDENTITY;
            return true;
        }

        const provider = await this.resolveProvider(token, request);
        if (!provider) {
            throw new UnauthorizedException();
        }

        try {
            const payload = await this.verifyToken(token, provider);
            const identity = await this.identity.resolveIdentity(payload, provider);
            (request as any)["user"] = identity;
        } catch {
            throw new UnauthorizedException();
        }

        return true;
    }

    private extractTokenFromHeader(request: FastifyRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }

    /**
     * Find the OAuthProvider for this request.
     * Prefers the `x-query` header (explicit provider ID), then falls back to
     * the `iss` claim in the JWT (same strategy used by the socket.io gateway).
     */
    private async resolveProvider(
        token: string,
        request: FastifyRequest,
    ): Promise<OAuthProviderDto | null> {
        const providerId = request.headers["x-query"] as string | undefined;
        if (providerId) {
            return this.findProviderById(providerId);
        }

        // Fall back: decode the token (without verifying) to extract the issuer domain
        const decoded = jwt.decode(token) as jwt.JwtPayload | null;
        if (!decoded?.iss) return null;

        try {
            const domain = new URL(decoded.iss).hostname;
            return this.findProviderByDomain(domain);
        } catch {
            return null;
        }
    }

    private async findProviderById(id: string): Promise<OAuthProviderDto | null> {
        const result = await this.db.executeFindQuery({
            selector: { _id: id, type: DocType.OAuthProvider },
            limit: 1,
        });
        return (result.docs?.[0] as OAuthProviderDto) ?? null;
    }

    private async findProviderByDomain(domain: string): Promise<OAuthProviderDto | null> {
        const result = await this.db.executeFindQuery({
            selector: { type: DocType.OAuthProvider, domain },
            limit: 1,
        });
        return (result.docs?.[0] as OAuthProviderDto) ?? null;
    }

    private verifyToken(token: string, provider: OAuthProviderDto): Promise<jwt.JwtPayload> {
        if (provider.providerType !== "auth0") {
            throw new UnauthorizedException();
        }

        const jwksUri = `https://${provider.domain}/.well-known/jwks.json`;
        const client = new JwksClient({ jwksUri });

        const getKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
            client.getSigningKey(header.kid, (err, key) => {
                if (err) return callback(err);
                callback(null, key.getPublicKey());
            });
        };

        const options: jwt.VerifyOptions = {};
        if (provider.audience) {
            options.audience = provider.audience;
        }

        return new Promise((resolve, reject) => {
            jwt.verify(token, getKey, options, (err, decoded) => {
                if (err) return reject(err);
                resolve(decoded as jwt.JwtPayload);
            });
        });
    }
}
