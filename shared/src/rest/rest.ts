import { httpReq } from "./http";
import { socketConnectionOptions } from "../types";
import { db, syncMap, SyncMapEntry } from "../db/database";
import { accessMap, AccessMap } from "../permissions/permissions";

type MissingGap = {
    gapStart: number;
    gapEnd: number;
};

type ApiQuery = {
    apiVersion: string;
    gapEnd?: number;
    gapStart?: number;
    cms?: boolean;
    contentOnly?: boolean;
    type?: string;
    accessMap: AccessMap;
};

class restAPi {
    private http: httpReq;
    private options: socketConnectionOptions;
    /**
     * Create a new socketio instance
     * @param options - Options
     */
    constructor(options: socketConnectionOptions) {
        this.options = options;
        this.http = new httpReq(options.apiUrl || "", options.token);
        // update accessMap
        // this.accessMapReq();
    }

    async clientDataReq() {
        const query: ApiQuery = {
            apiVersion: "0.0.0",
            gapEnd: 0,
            cms: this.options.cms,
            accessMap: accessMap.value,
        };
        await this.calcSyncMap();

        const _sm = Object.fromEntries(syncMap.value);
        for (const v of Object.values(_sm)) {
            const blocks = v.blocks;
            const newest = blocks.sort((a: SyncMapEntry, b: SyncMapEntry) => {
                if (!a || !b) return 0;
                return b.blockStart - a.blockStart;
            })[0];

            query.gapEnd = newest?.blockStart || 0;
            query.accessMap = newest?.accessMap || accessMap.value;
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

        console.log(data.blockStart);
        console.log(data.blockEnd);

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
        const version: any = await db.syncVersion;
        if (syncMap.value.keys.length < 1) await db.getSyncMap();
        if (syncMap.value.keys.length < 1 && this.options.docTypes)
            for (const v of this.options.docTypes) {
                const k = v.type + (v.contentOnly ? "_content" : "");
                syncMap.value.get(k) ||
                    syncMap.value.set(k, {
                        type: v.type,
                        contentOnly: v.contentOnly,
                        blocks: [
                            {
                                blockStart: parseInt(version) || 0, // backwards compatibility, so that users don't have to re-download the full database
                                blockEnd: 0,
                                accessMap: accessMap.value,
                                groups: this.calcGroups(),
                                type: v.type,
                                contentOnly: v.contentOnly,
                            },
                        ],
                    });
            }
        if (data) {
            const group: string = data.type + (data.contentOnly ? "_content" : "");
            const groupArray = syncMap.value.get(group) || { blocks: [] };
            this.insertBlock(
                {
                    blockStart: data.blockStart,
                    blockEnd: data.blockEnd,
                    accessMap: data.accessMap,
                    groups: this.calcGroups(),
                    type: data.type,
                    contentOnly: data.contentOnly,
                },
                groupArray.blocks,
            );
        }
        // console.log(Object.fromEntries(syncMap.value)["post_content"]);
        return syncMap;
    }

    /**
     * Inserts a block into the syncMap
     * @param block - block to insert
     * @param groupArray - array of blocks in current type
     */
    insertBlock(block: any, groupArray: Array<any>) {
        let changed: boolean = false;

        const newBlockStart = block.blockStart;
        const newBlockEnd = block.blockEnd;
        groupArray.forEach((_block) => {
            const blockStart = _block.blockStart;
            const blockEnd = _block.blockEnd;

            // expand block to end
            if (newBlockStart >= blockEnd && newBlockStart <= blockStart && newBlockEnd <= blockEnd)
                (_block.blockEnd = newBlockEnd), (changed = true);

            // expand block to start
            if (newBlockEnd >= blockEnd && newBlockEnd <= blockStart && newBlockStart >= blockStart)
                (_block.blockStart = newBlockStart), (changed = true);

            // expand overlap
            if (newBlockStart >= blockStart && newBlockEnd <= blockEnd)
                (_block.blockStart = newBlockStart),
                    (_block.blockEnd = newBlockEnd),
                    (changed = true);

            // contains, to not expand
            if (newBlockStart <= blockStart && newBlockEnd >= blockEnd) changed = true;
        });

        if (!changed) groupArray.push(block);

        this.concatBlock(groupArray);
    }

    /**
     * Concatenate 2 or more blocks with overlapping timestamps
     * @param groupArray - array of blocks in current type
     */
    concatBlock(groupArray: Array<any>) {
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

    calcGroups(): Array<string> {
        return Object.keys(accessMap.value);
    }

    // async accessMapReq() {
    //     const data = await this.http.post("docs", {
    //         apiVersion: "test2",
    //         version: await db.syncVersion,
    //         cms: this.options.cms,
    //         accessMap: accessMap.value,
    //         backfillDataReq: true,
    //     });

    //     if (data) await db.bulkPut(data.docs);
    //     if (data.accessMap) accessMap.value = data.accessMap;
    // }
}

let rest: restAPi;

/**
 * Returns a singleton instance of the restApi client class. The api URL, token and CMS flag is only used when calling the function for the first time.
 * @param options - Socket connection options
 */
export function getRest(options?: socketConnectionOptions) {
    if (rest) return rest;

    if (!options) {
        throw new Error("Rest API connection requires options object");
    }
    if (!options.apiUrl) {
        throw new Error("Rest API connection requires an API URL");
    }
    if (!options.docTypes || !options.docTypes[0]) {
        throw new Error(
            "Rest API connection requires an array of DocTypes that needs to be synced",
        );
    }
    if (!options.cms) options.cms = false;

    rest = new restAPi(options);

    return rest;
}
