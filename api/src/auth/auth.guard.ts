import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { DbService } from "../db/db.service";
import { verifyJwtAndMatchProvider } from "../jwt/verifyJwt";

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private db: DbService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const token = this.extractTokenFromHeader(request);
        if (!token) {
            throw new UnauthorizedException();
        }

        const result = await verifyJwtAndMatchProvider(token, this.db);
        if (!result?.jwtPayload) {
            throw new UnauthorizedException();
        }

        (request as unknown as Record<string, unknown>)["user"] =
            result.jwtPayload;
        return true;
    }

    private extractTokenFromHeader(
        request: FastifyRequest,
    ): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
