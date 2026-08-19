import { Controller, Get, Header, HttpException, HttpStatus, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard";
import { DbService } from "../db/db.service";
import { validateApiVersion } from "../validation/apiVersion";
import { PermissionSystem } from "../permissions/permissions.service";
import { AclPermission, DocType, SidecarType, Uuid } from "../enums";
import { getSidecar, isParentAvailable, sidecarId } from "../sidecar/sidecar.service";
import { isHlsEncryptionKeyData } from "../sidecar/hlsEncryptionKey";

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
    constructor(private readonly dbService: DbService) {}

    @Get()
    @UseGuards(AuthGuard)
    @Header("Cache-Control", "no-store")
    async getSidecar(
        @Query("parentId") parentId: string,
        @Query("sidecarType") sidecarType: string,
        @Query("cms") cms: string,
        @Query("apiVersion") apiVersion: string,
        @Req() request: FastifyRequest,
    ): Promise<SidecarResponseDto> {
        await validateApiVersion(apiVersion);

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
            throw new HttpException("Not found", HttpStatus.NOT_FOUND);
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
            throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);
        }

        // A View grant is permanent; publication state is not. Draft/scheduled/expired
        // parents are refused to a non-CMS caller even holding View (docs/sidecar/02). The
        // CMS is exempt — an editor previewing media ahead of publish holds only CmsView and
        // has no live Content yet, mirroring the cms-exempts-publish-gating rule in
        // query.service.ts / ftsSearch.service.ts.
        if (!isCms) {
            const available = await isParentAvailable(this.dbService, parentId, Date.now());
            if (!available) {
                throw new HttpException("Not found", HttpStatus.NOT_FOUND);
            }
        }

        const sidecar = await getSidecar(this.dbService, parentId, sidecarType as SidecarType);
        if (!sidecar) {
            throw new HttpException("Not found", HttpStatus.NOT_FOUND);
        }

        switch (sidecarType as SidecarType) {
            case SidecarType.HlsEncryptionKey:
                if (!isHlsEncryptionKeyData(sidecar.data)) {
                    throw new HttpException("Sidecar payload is corrupt", HttpStatus.CONFLICT);
                }
                break;
        }

        return {
            sidecarId: sidecarId(parentId, sidecarType as SidecarType),
            parentId,
            sidecarType: sidecarType as SidecarType,
            data: sidecar.data,
        };
    }
}
