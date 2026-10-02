import { Inject, Injectable, MessageEvent, OnModuleInit } from "@nestjs/common";
import { Observable, Subject, filter, interval, map, merge, of } from "rxjs";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { DbService } from "../db/db.service";
import { AclPermission, DocType, PublishStatus } from "../enums";
import { AccessMap, PermissionSystem } from "../permissions/permissions.service";
import { isExpiredContent, stripExpiredContent } from "../util/stripExpiredContent";
import configuration from "../configuration";

/** One routed database change: the doc to push and the doc type/groups that decide who may see it. */
type LiveChange = { refType: string; refGroups: string[]; update: any; version?: number };

type LiveEvent = { type: "clientConfig" | "data" | "ping"; data: string | object };

const HEARTBEAT_MS = 25_000;

/**
 * Pushes database changes to open `/live` SSE connections. Replaces the Socket.io room model with
 * a per-connection filter: each connection holds the groups its accessMap grants per doc type.
 */
@Injectable()
export class LiveService implements OnModuleInit {
    private readonly changes$ = new Subject<LiveChange>();

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
        private readonly db: DbService,
    ) {}

    onModuleInit() {
        this.db.on("update", (update: any) => this.route(update));
    }

    /**
     * Open a connection for a user. `cms` selects CmsView-scoped delivery (drafts and expired
     * content in full); otherwise View-scoped (published only, expired content stripped).
     */
    connect(accessMap: AccessMap, cms: boolean): Observable<MessageEvent> {
        const permission = cms ? AclPermission.CmsView : AclPermission.View;
        const groupsByType = PermissionSystem.accessMapToGroups(
            accessMap,
            permission,
            Object.values(DocType),
        ) as unknown as Record<string, string[]>;
        const deleteCmdGroups = new Set(Object.values(groupsByType).flat());

        const clientConfig: LiveEvent = {
            type: "clientConfig",
            data: {
                maxUploadFileSize: configuration().socketIo.maxHttpBufferSize,
                accessMap,
            },
        };

        const data$ = this.changes$.pipe(
            map((change) => {
                // DeleteCmd docs are shared by both modes: any accessible group qualifies.
                const allowed =
                    change.refType === DocType.DeleteCmd
                        ? [...deleteCmdGroups]
                        : groupsByType[change.refType];
                if (!allowed?.some((g) => change.refGroups.includes(g))) return undefined;
                const docs = this.docsFor(change.update, cms);
                return (
                    docs && ({ type: "data", data: { docs, version: change.version } } as LiveEvent)
                );
            }),
            filter((e): e is LiveEvent => e !== undefined),
        );

        return merge(
            of(clientConfig),
            data$,
            // Keeps idle streams open through proxies
            interval(HEARTBEAT_MS).pipe(map((): LiveEvent => ({ type: "ping", data: "" }))),
        );
    }

    /** What a connection of the given mode may hold for this doc, or undefined to withhold it. */
    private docsFor(update: any, cms: boolean): any[] | undefined {
        if (cms || update.type !== DocType.Content) return [update];
        // App connections never receive drafts; the app is evicted via an app-only StatusChange DeleteCmd.
        if (update.status !== PublishStatus.Published) return undefined;
        // Expired content arrives as a stub so the app prunes its copy without the body on the wire.
        return isExpiredContent(update, Date.now()) ? [stripExpiredContent(update)] : [update];
    }

    /** Resolve the doc a change belongs to (its type and groups) and publish it to connections. */
    private async route(update: any) {
        if (!update.type || update.type === DocType.Sidecar) return;

        let refDoc = update;
        if (refDoc.type == "change" && refDoc.changes) refDoc = update.changes;

        // Content is routed by its parent's type and groups
        if (refDoc.type == "content") {
            const res = await this.db.getDoc(refDoc.parentId);
            if (!(res.docs && Array.isArray(res.docs) && res.docs.length > 0)) {
                this.logger.warn(`Parent document not found for content document: ${refDoc._id}`);
                return;
            }
            refDoc = res.docs[0];
        }

        const refGroups: string[] = refDoc.type == "group" ? [refDoc._id] : refDoc.memberOf || [];
        if (refGroups.length === 0) return;

        this.changes$.next({
            refType: refDoc.type,
            refGroups,
            update,
            version: update.updatedTimeUtc ? update.updatedTimeUtc : undefined,
        });
    }
}
