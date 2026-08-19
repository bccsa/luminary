import {
    Controller,
    Get,
    Header,
    HttpException,
    HttpStatus,
    Query,
    Req,
    Res,
    UseGuards,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard";
import { DbService } from "../db/db.service";
import { validateApiVersion } from "../validation/apiVersion";
import { PermissionSystem } from "../permissions/permissions.service";
import { AclPermission, DocType, SidecarType, Uuid } from "../enums";
import { getSidecar, isParentAvailable, sidecarId } from "../sidecar/sidecar.service";
import { isHlsEncryptionKeyData } from "../sidecar/hlsEncryptionKey";
import { SidecarRateLimiterService } from "../ratelimit/sidecarRateLimiter.service";

export type SidecarResponseDto = {
    sidecarId: Uuid;
    parentId: Uuid;
    sidecarType: SidecarType;
    data: unknown;
};

/**
 * Serves sidecar payloads (currently: the HLS decryption key) one parent at a time.
 * See docs/sidecar/02, 09, 10 — no batch parameter and no listing endpoint by design
 * (docs/sidecar/08), so bulk extraction costs one authorised request per parent.
 */
@Controller("sidecar")
export class SidecarController {
    constructor(
        private readonly dbService: DbService,
        private readonly rateLimiter: SidecarRateLimiterService,
    ) {}

    @Get()
    @UseGuards(AuthGuard)
    @Header("Cache-Control", "no-store")
    async getSidecar(
        @Query("parentId") parentId: string,
        @Query("sidecarType") sidecarType: string,
        @Query("cms") cms: string,
        @Query("apiVersion") apiVersion: string,
        @Req() request: FastifyRequest,
        @Res({ passthrough: true }) reply: FastifyReply,
    ): Promise<SidecarResponseDto> {
        await validateApiVersion(apiVersion);

        // Same identity used by both limiters (docs/sidecar/02#rate-limiting) — read bounds
        // successful key fetches, probe bounds repeated 403/404s. Both gate pre-execution; a
        // blocked identity is rejected before doing any work.
        const identityKey = request.user?.userId ?? `anon:${request.ip}`;

        const readGate = this.rateLimiter.checkRead(identityKey);
        if (!readGate.allowed) {
            reply.header("Retry-After", String(Math.ceil(readGate.retryAfterMs / 1000)));
            throw new HttpException("Too many key requests; retry later", HttpStatus.TOO_MANY_REQUESTS);
        }
        const probeGate = this.rateLimiter.checkProbe(identityKey);
        if (!probeGate.allowed) {
            reply.header("Retry-After", String(Math.ceil(probeGate.retryAfterMs / 1000)));
            throw new HttpException("Too many failed requests; retry later", HttpStatus.TOO_MANY_REQUESTS);
        }

        // 403/404 below are the probe limiter's target (parent-id / permission probing); 400 and
        // 409 are not — a caller can't learn anything about a parent it doesn't already know from
        // those, so they don't strike.
        const probeFail = (status: HttpStatus, message: string): never => {
            this.rateLimiter.recordProbeStrike(identityKey);
            throw new HttpException(message, status);
        };

        if (!parentId) {
            throw new HttpException("parentId query parameter is required", HttpStatus.BAD_REQUEST);
        }
        if (!sidecarType || !Object.values(SidecarType).includes(sidecarType as SidecarType)) {
            throw new HttpException(
                "sidecarType query parameter is required and must be a known sidecar type",
                HttpStatus.BAD_REQUEST,
            );
        }

        const isCms = cms === "true";
        const userDetails = request.user;

        // 404 for both "no such parent" and "no sidecar" so the response can't be used to
        // probe which parent IDs exist (docs/sidecar/02).
        const parent = (await this.dbService.getDoc(parentId)).docs?.[0];
        if (!parent || (parent.type !== DocType.Post && parent.type !== DocType.Tag)) {
            probeFail(HttpStatus.NOT_FOUND, "Not found");
        }

        // Same cms ? CmsView : View split as /query and /fts (GitHub #160): CmsView is the
        // editor's grant and covers drafts, so a CMS caller doesn't also need View.
        const hasPermission = PermissionSystem.verifyAccess(
            parent.memberOf,
            parent.type,
            isCms ? AclPermission.CmsView : AclPermission.View,
            userDetails.groups,
        );
        if (!hasPermission) {
            probeFail(HttpStatus.FORBIDDEN, "Forbidden");
        }

        // A View grant is permanent; publication state is not. Draft/scheduled/expired
        // parents are refused to a non-CMS caller even holding View (docs/sidecar/02). The
        // CMS is exempt — an editor previewing media ahead of publish holds only CmsView and
        // has no live Content yet, mirroring the cms-exempts-publish-gating rule in
        // query.service.ts / ftsSearch.service.ts.
        if (!isCms) {
            const available = await isParentAvailable(this.dbService, parentId, Date.now());
            if (!available) {
                probeFail(HttpStatus.NOT_FOUND, "Not found");
            }
        }

        const sidecar = await getSidecar(this.dbService, parentId, sidecarType as SidecarType);
        if (!sidecar) {
            probeFail(HttpStatus.NOT_FOUND, "Not found");
        }

        switch (sidecarType as SidecarType) {
            case SidecarType.HlsEncryptionKey:
                if (!isHlsEncryptionKeyData(sidecar.data)) {
                    throw new HttpException("Sidecar payload is corrupt", HttpStatus.CONFLICT);
                }
                break;
        }

        this.rateLimiter.recordReadStrike(identityKey);

        return {
            sidecarId: sidecarId(parentId, sidecarType as SidecarType),
            parentId,
            sidecarType: sidecarType as SidecarType,
            data: sidecar.data,
        };
    }
}
