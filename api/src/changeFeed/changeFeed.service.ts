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
type LiveChange = {
    refType: string;
    /** Type of the doc as delivered (content for content docs, unlike refType which is its parent's). */
    docType: string;
    refGroups: string[];
    update: any;
    version?: number;
    /** Event carrying the doc in full, built once and shared by every connection. */
    full: LiveEvent;
    /** Expired-content stub event, built on first use and shared by app connections. */
    stripped?: LiveEvent;
};

type LiveEvent = { type: "clientConfig" | "data" | "ping"; data: string | object };

const HEARTBEAT_MS = 25_000;

/**
 * Pushes database changes to open `/live` SSE connections. Replaces the Socket.io room model with
 * a per-connection filter: each connection holds the groups its accessMap grants per doc type.
 */
@Injectable()
export class ChangeFeedService implements OnModuleInit {
    private readonly changes$ = new Subject<LiveChange>();

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
        private readonly db: DbService,
    ) {}

    onModuleInit() {
        this.db.on("update", (update: any) =>
            this.route(update).catch((e) =>
                this.logger.error(`Live routing failed for ${update?._id}: ${e?.message}`),
            ),
        );
    }

    /**
     * Open a connection for a user. `cms` selects CmsView-scoped delivery (drafts and expired
     * content in full); otherwise View-scoped (published only, expired content stripped).
     * `types` optionally narrows delivery to those doc types (unknown values are ignored).
     */
    connect(accessMap: AccessMap, cms: boolean, types?: string[]): Observable<MessageEvent> {
        const permission = cms ? AclPermission.CmsView : AclPermission.View;
        const groupsByType = PermissionSystem.accessMapToGroups(
            accessMap,
            permission,
            Object.values(DocType),
        ) as unknown as Record<string, string[]>;
        const deleteCmdGroups = new Set(Object.values(groupsByType).flat());
        const requested = types?.filter((t) => (Object.values(DocType) as string[]).includes(t));
        const wanted = (type: string) => !requested?.length || requested.includes(type);
        const groupSetsByType = new Map<string, Set<string>>();
        for (const type in groupsByType) groupSetsByType.set(type, new Set(groupsByType[type]));

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
                        ? deleteCmdGroups
                        : groupSetsByType.get(change.refType);
                if (!allowed || !wanted(change.docType)) return undefined;
                for (const g of change.refGroups) if (allowed.has(g)) return this.eventFor(change, cms);
                return undefined;
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

    /** What a connection of the given mode may hold for this change, or undefined to withhold it. */
    private eventFor(change: LiveChange, cms: boolean): LiveEvent | undefined {
        const update = change.update;
        if (cms || update.type !== DocType.Content) return change.full;
        // App connections never receive drafts; the app is evicted via an app-only StatusChange DeleteCmd.
        if (update.status !== PublishStatus.Published) return undefined;
        // Expired content arrives as a stub so the app prunes its copy without the body on the wire.
        if (isExpiredContent(update, Date.now())) {
            return (change.stripped ??= this.dataEvent([stripExpiredContent(update)], change.version));
        }
        return change.full;
    }

    private dataEvent(docs: any[], version?: number): LiveEvent {
        return { type: "data", data: { docs, version } };
    }

    /** Resolve the doc a change belongs to (its type and groups) and publish it to connections. */
    private async route(update: any) {
        if (!update.type) {
            this.logger.warn(`Document type not found in database update object: ${update._id}`);
            return;
        }
        if (update.type === DocType.Sidecar) return;

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

        const version = update.updatedTimeUtc ? update.updatedTimeUtc : undefined;
        this.changes$.next({
            refType: refDoc.type,
            docType: update.type === DocType.Content ? DocType.Content : refDoc.type,
            refGroups,
            update,
            version,
            full: this.dataEvent([update], version),
        });
    }
}
