import { httpReq } from "../rest/http";
import { ApiConnectionOptions } from "../types";
import { db, SyncMap, syncMap, SyncMapEntry } from "../db/database";
import { accessMap, AccessMap } from "../permissions/permissions";

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
    accessMap: AccessMap;
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
                accessMap: accessMap.value,
            };
            const blocks = v.blocks;
            const newest = blocks.sort((a: SyncMapEntry, b: SyncMapEntry) => {
                if (!a || !b) return 0;
                return b.blockStart - a.blockStart;
            })[0];

            query.gapEnd = newest?.blockStart || 0;
            query.accessMap = v.accessMap || accessMap.value;
            query.type = v.type;
            query.contentOnly = v.contentOnly;

            // request newest data
            await this.req(query);
        }
    }

    /**
     * Query the api
     * @param query
     */
    async req(query: ApiQuery): Promise<any> {
        const data = await this.http.post("docs", query);
        if (data && data.docs.length > 0) await db.bulkPut(data.docs);
        if (!data)
            return setTimeout(() => {
                this.req(query);
            }, 5000);

        await this.calcSyncMap(data);
        const missingData = this.calcMissingData(
            query.type + (query.contentOnly ? "_content" : ""),
        );
        // stop loop when gap is the same as previous round, this means that no new data was added
        if (query.gapStart == missingData.gapStart && query.gapEnd == missingData.gapEnd) return;
        query.gapStart = missingData.gapStart;
        query.gapEnd = missingData.gapEnd; // End == from, start == to
        await this.req(query);
    }

    /**
     * Calculates the next piece of missing data
     * @param type - DocType
     * @returns
     */
    calcMissingData(type: string): MissingGap {
        const group = syncMap.value.get(type) || {
            blocks: [],
        };
        const blocks = group.blocks;

        if (blocks.length == 0) return { gapStart: 0, gapEnd: 0 };

        const gapStart = blocks.reduce((prev: SyncMapEntry, curr: SyncMapEntry) =>
            prev.blockStart > curr.blockStart ? prev : curr,
        );

        if (blocks.length == 1) return { gapStart: gapStart.blockEnd, gapEnd: 0 };

        const gapEnd = blocks.reduce((prev: SyncMapEntry, curr: SyncMapEntry) =>
            curr !== gapStart && prev.blockStart < curr.blockStart ? curr : prev,
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
        if (this.options.docTypes)
            for (const v of this.options.docTypes) {
                const k = v.type + (v.contentOnly ? "_content" : "");
                const f = syncMap.value.get(k);
                const block: SyncMapEntry = {
                    blockStart: 0,
                    blockEnd: 0,
                    type: v.type,
                    contentOnly: v.contentOnly,
                };
                // if user permissions changed, reSync block of data, this is to include data that the user now has access to
                (!f || f.groups.toString() !== this.calcGroups().toString()) &&
                    syncMap.value.set(k, {
                        type: v.type,
                        contentOnly: v.contentOnly,
                        accessMap: accessMap.value,
                        groups: this.calcGroups(),
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
        const group: string = data.type + (data.contentOnly ? "_content" : "");
        const groupArray: SyncMap = syncMap.value.get(group) || {
            blocks: [],
            contentOnly: true,
            type: "post",
            accessMap: data.accessMap,
            groups: this.calcGroups(),
        };
        const block: SyncMapEntry = {
            blockStart: data.blockStart,
            blockEnd: data.blockEnd,
            type: data.type,
            contentOnly: data.contentOnly,
        };

        let changed: boolean = false;

        const newBlockStart = block.blockStart;
        const newBlockEnd = block.blockEnd;
        groupArray.blocks.forEach((_block) => {
            const blockStart = _block.blockStart;
            const blockEnd = _block.blockEnd;

            // expand block to end
            if (newBlockStart >= blockEnd && newBlockStart <= blockStart && newBlockEnd <= blockEnd)
                (_block.blockEnd = newBlockEnd), (changed = true);

            // expand block to start
            if (newBlockEnd >= blockEnd && newBlockEnd <= blockStart && newBlockStart >= blockStart)
                (_block.blockStart = newBlockStart), (changed = true);

            // expand overlap block (If existing block is within incoming block)
            if (newBlockStart >= blockStart && newBlockEnd <= blockEnd)
                (_block.blockStart = newBlockStart),
                    (_block.blockEnd = newBlockEnd),
                    (changed = true);

            // contains, to not expand (If incoming block is within existing block)
            if (newBlockStart <= blockStart && newBlockEnd >= blockEnd) changed = true;
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
            const blockStart = _block.blockStart;
            const blockEnd = _block.blockEnd;

            // find a block start that falls in this block
            const overlapStart = groupArray.reduce(
                (prev, curr) =>
                    curr != _block &&
                    curr.blockStart <= blockStart &&
                    curr.blockStart >= blockEnd &&
                    curr.blockEnd <= blockEnd
                        ? curr
                        : prev,
                undefined,
            );
            if (overlapStart) (overlapStart.blockStart = blockStart), delete groupArray[i];

            const overlapBoth = groupArray.reduce(
                (prev, curr) =>
                    curr != _block && curr.blockStart >= blockStart && curr.blockEnd <= blockEnd
                        ? curr
                        : prev,
                undefined,
            );
            if (overlapBoth) delete groupArray[i];
        });
    }

    calcGroups(am: AccessMap = accessMap.value): Array<string> {
        return Object.keys(am);
    }
}
