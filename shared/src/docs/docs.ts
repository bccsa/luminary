import { httpReq } from "../rest/http";
import { ApiConnectionOptions, DocType } from "../types";
import { db, syncMap, SyncMapEntry } from "../db/database";
import { accessMap } from "../permissions/permissions";

type MissingGap = {
    gapStart: number;
    gapEnd: number;
};

type ApiQuery = {
    apiVersion: string;
    gapEnd?: number;
    gapStart?: number;
    contentOnly?: boolean;
    type?: string;
    docTypes?: Array<any>;
    group: string;
};

type SyncEntryKey = {
    id: string;
    contentOnly?: boolean;
    type: string;
    group: string;
};

export class Docs {
    private http: httpReq;
    private options: ApiConnectionOptions;
    /**
     * Create a new Docs instance
     * @param options - Options
     */
    constructor(options: ApiConnectionOptions) {
        this.options = options;
        this.http = new httpReq(options.apiUrl || "", options.token);
    }

    async clientDataReq() {
        await this.calcSyncMap();

        const _sm = Object.fromEntries(syncMap.value);
        for (const v of Object.values(_sm)) {
            const query: ApiQuery = {
                apiVersion: "0.0.0",
                gapEnd: 0,
                docTypes: this.options.docTypes,
                group: v.group,
            };
            const blocks = v.blocks;
            const newest = blocks.sort((a: SyncMapEntry, b: SyncMapEntry) => {
                if (!a || !b) return 0;
                return b.blockStart - a.blockStart;
            })[0];

            query.gapEnd = newest?.blockStart || 0;
            query.type = v.type;
            query.contentOnly = v.contentOnly;
            query.group = v.group;

            // request newest data
            this.req(query, v.id);
        }
    }

    /**
     * Query the api
     * @param query - query to send
     * @param id   - id of the syncMap entry
     */
    async req(query: ApiQuery, id: string): Promise<any> {
        const data = await this.http.get("docs", query);
        if (data && data.docs.length > 0) await db.bulkPut(data.docs);
        if (!data)
            return setTimeout(() => {
                this.req(query, id);
            }, 5000);

        data.id = id;
        if (data.gapStart != 0 && data.gapEnd != 0) await this.calcSyncMap(data);

        // only continue if there is more than one block
        const blocks = syncMap.value.get(id)?.blocks;
        if (!blocks || blocks.length < 2) return;

        const missingData = this.calcMissingData(id);
        // stop loop when gap is the same as previous round, this means that no new data was added
        if (query.gapStart == missingData.gapStart && query.gapEnd == missingData.gapEnd) {
            // delete block with blockEnd == 0 and blockStart == 0, since the api has completed the backfill, this will help that the client does not hammer the api unnecessarily
            this.removeBlock00(id);
            return;
        }
        query.gapStart = missingData.gapStart;
        query.gapEnd = missingData.gapEnd; // End == from, start == to
        await this.req(query, id);
    }

    /**
     * Calculates the next piece of missing data
     * @param id - EntryID
     * @returns
     */
    calcMissingData(id: string): MissingGap {
        const group = syncMap.value.get(id) || {
            blocks: [],
        };
        const blocks = group.blocks;

        if (blocks.length == 0) return { gapStart: 0, gapEnd: 0 };

        const gapStart = blocks.reduce((prev: SyncMapEntry, curr: SyncMapEntry) =>
            curr && prev.blockStart <= curr.blockStart ? curr : prev,
        );

        if (blocks.length == 1) return { gapStart: gapStart.blockEnd, gapEnd: 0 };

        const gapEnd = blocks.reduce((prev: SyncMapEntry, curr: SyncMapEntry) =>
            curr && curr !== gapStart && prev.blockStart < curr.blockStart ? curr : prev,
        );

        return { gapStart: gapStart?.blockEnd || 0, gapEnd: gapEnd?.blockStart || 0 };
    }

    /**
     * Calculates and updates current sync map
     * @param data - api response data
     * @returns
     */
    async calcSyncMap(data?: any) {
        if (syncMap.value.keys.length < 1) await db.getSyncMap();
        const syncEntries: Array<SyncEntryKey> = this.calcSyncEntryKeys();
        for (const v of syncEntries) {
            const f = syncMap.value.get(v.id);
            const block: SyncMapEntry = {
                blockStart: 0,
                blockEnd: 0,
            };
            // Add new entry if not exists
            !f &&
                syncMap.value.set(v.id, {
                    id: v.id,
                    type: v.type,
                    contentOnly: v.contentOnly,
                    accessMap: accessMap.value,
                    group: v.group,
                    blocks: [block],
                });
        }
        if (data) this.insertBlock(data);
        return syncMap;
    }

    /**
     * Inserts a block into the syncMap
     * @param block - block to insert
     * @param groupArray - array of blocks in current type
     */
    insertBlock(data: any) {
        const group: string = data.id;
        const groupArray = syncMap.value.get(group) || {
            blocks: [] as SyncMapEntry[],
        };

        const block: SyncMapEntry = {
            blockStart: data.blockStart,
            blockEnd: data.blockEnd,
        };

        let changed: boolean = false;

        const newBlockStart = block.blockStart;
        const newBlockEnd = block.blockEnd;
        groupArray.blocks.forEach((_block) => {
            if (_block) {
                // TODO: remove this and improve delete login, to not leave undefined blocks
                const blockStart = _block.blockStart;
                const blockEnd = _block.blockEnd;

                // expand block to end
                if (
                    newBlockStart >= blockEnd &&
                    newBlockStart <= blockStart &&
                    newBlockEnd <= blockEnd
                )
                    (_block.blockEnd = newBlockEnd), (changed = true);

                // expand block to start
                if (
                    newBlockEnd >= blockEnd &&
                    newBlockEnd <= blockStart &&
                    newBlockStart >= blockStart
                )
                    (_block.blockStart = newBlockStart), (changed = true);

                // expand overlap block (If existing block is within incoming block)
                if (newBlockStart >= blockStart && newBlockEnd <= blockEnd)
                    (_block.blockStart = newBlockStart),
                        (_block.blockEnd = newBlockEnd),
                        (changed = true);

                // contains, to not expand (If incoming block is within existing block)
                if (newBlockStart <= blockStart && newBlockEnd >= blockEnd) changed = true;
            }
        });

        if (!changed) groupArray.blocks.push(block);

        this.mergeBlock(groupArray.blocks);
    }

    /**
     * Merge 2 or more blocks with overlapping timestamps
     * @param groupArray - array of blocks in current type
     */
    mergeBlock(groupArray: Array<any>) {
        groupArray.forEach((_block, i) => {
            if (!_block) return; // TODO: remove this and improve delete login, to not leave undefined blocks
            const blockStart = _block.blockStart;
            const blockEnd = _block.blockEnd;

            // find a block start that falls in this block
            const overlapStart = groupArray.reduce(
                (prev, curr) =>
                    curr &&
                    curr.blockStart != _block.blockStart &&
                    curr.blockEnd != _block.blockEnd &&
                    curr.blockStart <= blockStart &&
                    curr.blockStart >= blockEnd &&
                    curr.blockEnd <= blockEnd
                        ? curr
                        : prev,
                undefined,
            );
            if (overlapStart && i > -1) {
                overlapStart.blockStart = blockStart;
                groupArray.splice(i, 1);
                return;
            }

            // find a block that overlaps this block
            const overlapBoth = groupArray.reduce(
                (prev, curr) =>
                    curr &&
                    curr.blockStart != _block.blockStart &&
                    curr.blockEnd != _block.blockEnd &&
                    curr.blockStart >= blockStart &&
                    curr.blockEnd <= blockEnd
                        ? curr
                        : prev,
                undefined,
            );
            if (overlapBoth && i > -1) {
                groupArray.splice(i, 1);
                return;
            }
        });
    }

    /**
     * Calculate sync entry keys
     * @returns
     */
    calcSyncEntryKeys(): Array<SyncEntryKey> {
        const syncEntries: Array<SyncEntryKey> = [];
        if (!this.options.docTypes) return [];
        // add and exception for DocType.Group, since groups is the only docType that does not have a group (memberOf)
        for (const docType of this.options.docTypes)
            if (docType.type == DocType.Group)
                syncEntries.push({
                    id: docType.type + (docType.contentOnly ? "_content" : ""),
                    contentOnly: docType.contentOnly,
                    group: "",
                    type: docType.type,
                });
            else
                for (const group of Object.keys(accessMap.value))
                    syncEntries.push({
                        id: `${docType.type}_${group}` + (docType.contentOnly ? "_content" : ""),
                        contentOnly: docType.contentOnly,
                        type: docType.type,
                        group: group,
                    });

        return syncEntries;
    }

    /**
     * Remove the block from the syncMap with blockStart == 0 and blockEnd == 0,
     * this will help that the client does not hammer the api unnecessarily,
     * since it will not request for back fill data between 00 and next block anymore
     * We assume that the api has completed the back fill between 00 and next block
     * @param id - id of the syncMap entry
     */
    removeBlock00(id: string) {
        const group = syncMap.value.get(id);
        if (!group) return;
        const block = group.blocks.find((b) => b.blockEnd == 0 && b.blockStart == 0);
        if (block) group.blocks.splice(group.blocks.indexOf(block), 1);
    }
}
