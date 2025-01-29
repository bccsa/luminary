import { api } from "../api/api";
import { ApiSearchQuery } from "./RestApi";
import { ApiConnectionOptions, DocType } from "../types";
import { db, syncMap, SyncMapEntry } from "../db/database";
import { accessMap } from "../permissions/permissions";
import { watch } from "vue";
import _ from "lodash";

type MissingGap = {
    gapStart: number;
    gapEnd: number;
};

type QueueReqEntry = {
    query: ApiSearchQuery;
    id: string;
    syncPriority: number;
};

export class Sync {
    private options: ApiConnectionOptions;
    private queue: number = 0;
    /**
     * Create a new Sync instance
     * @param options - Options
     */
    constructor(options: ApiConnectionOptions) {
        this.options = options;
        watch(
            accessMap.value,
            async () => {
                await this.calcSyncMap();
            },
            { immediate: true },
        );
    }

    async clientDataReq() {
        await this.calcSyncMap();
        const queue: Array<QueueReqEntry> = [];

        const _sm = Object.fromEntries(syncMap.value);
        for (const v of Object.values(_sm)) {
            const query: ApiSearchQuery = {
                apiVersion: "0.0.0",
                from: 0,
                types: v.types as DocType[],
                groups: v.groups,
                contentOnly: v.contentOnly,
                limit: 100,
            };
            const blocks = v.blocks;
            const newest = blocks.sort((a: SyncMapEntry, b: SyncMapEntry) => {
                if (!a || !b) return 0;
                return b.blockStart - a.blockStart;
            })[0];

            query.from = newest?.blockStart || 0;

            // request newest data
            // implement a queue that will handle 10 request at a time
            queue.push({ query, id: v.id, syncPriority: v.syncPriority });
        }

        this.processQueue(this.sortQueue(queue));
    }

    /**
     * Process the queue of requests according to priority
     * @param queue - queue of requests
     */
    async processQueue(queueReq: Array<QueueReqEntry>) {
        const queueSize = 10;

        if (this.queue <= queueSize && queueReq.length > 0) {
            this.queue++;
            this.processQueue(queueReq);
            const req = queueReq.shift();
            if (!req?.query && !req?.id) return;
            await this.req(req.query, req.id);
            this.queue--;
            this.processQueue(queueReq);
        }
    }

    /**
     * Query the api
     * @param query - query to send
     * @param id   - id of the syncMap entry
     */
    async req(query: ApiSearchQuery, id: string): Promise<any> {
        const data = await api().rest().search(query);
        if (data && data.docs.length > 0) await db.bulkPut(data.docs);
        if (!data)
            return setTimeout(() => {
                this.req(query, id);
            }, 5000);

        data.id = id;
        if (data.blockStart != 0 && data.blockEnd != 0) this.insertBlock(data);

        // only continue if there is more than one block
        const blocks = syncMap.value.get(id)?.blocks;
        if (!blocks || blocks.length < 2) return;

        const missingData = this.calcMissingData(id);
        // stop loop when gap is the same as previous round, this means that no new data was added
        if (query.to == missingData.gapStart && query.from == missingData.gapEnd) {
            // delete block with blockEnd == 0 and blockStart == 0, since the api has completed the backfill, this will help that the client does not hammer the api unnecessarily
            this.removeBlock00(id);
            this.mergeSyncMapEntries(id);
            return;
        }
        query.to = missingData.gapStart;
        query.from = missingData.gapEnd; // End == from, start == to
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

        // find the block with the highest blockStart
        const gapStart = blocks.reduce((prev: SyncMapEntry, curr: SyncMapEntry) =>
            curr && prev.blockStart <= curr.blockStart ? curr : prev,
        );

        if (blocks.length == 1) return { gapStart: gapStart.blockEnd, gapEnd: 0 };

        // find the block with the greatest blockEnd, but is not the same as gapStart
        const gapEnd = blocks.reduce(
            (prev: SyncMapEntry, curr: SyncMapEntry) =>
                curr &&
                curr.blockStart !== gapStart.blockStart &&
                curr.blockEnd !== gapStart.blockEnd &&
                prev.blockStart < curr.blockStart
                    ? curr
                    : prev,
            { blockStart: 0, blockEnd: 0 },
        );

        return { gapStart: gapStart?.blockEnd || 0, gapEnd: gapEnd?.blockStart || 0 };
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
     * Merge 2 or more syncMap entries with the same syncPriority and contentOnly
     * @param id - id of the syncMap entry
     */
    mergeSyncMapEntries(id: string) {
        const entry = syncMap.value.get(id);
        const blocks = entry?.blocks;
        if (blocks && blocks.length < 2) {
            const groups = syncMap.value.get(id)?.groups;
            const types = syncMap.value.get(id)?.types;
            const contentOnly = syncMap.value.get(id)?.contentOnly;
            const syncPriority = syncMap.value.get(id)?.syncPriority;

            const _sm = Object.fromEntries(syncMap.value);
            const parent = Object.values(_sm).find(
                (f) =>
                    f.contentOnly == contentOnly &&
                    f.syncPriority == syncPriority &&
                    !_.isEqual(f, entry),
            );

            if (!parent) return;
            const newGroups = Array.from(new Set([...(parent.groups || []), ...(groups || [])]));
            const newTypes = Array.from(new Set([...(parent.types || []), ...(types || [])]));

            syncMap.value.set(parent.id, {
                ..._.cloneDeep(parent),
                groups: _.cloneDeep(newGroups),
                types: _.cloneDeep(newTypes),
            });
            syncMap.value.delete(id);
        }
    }

    /**
     * Calculates and updates current sync map
     * @returns
     */
    async calcSyncMap() {
        const groups: Array<string> = Object.keys(accessMap.value);
        await db.getSyncMap();

        const syncPriorityContentOnly = this.options.docTypes?.filter(
            (value, index, self) =>
                index ===
                self.findIndex(
                    (t) =>
                        t.syncPriority === value.syncPriority &&
                        t.contentOnly === value.contentOnly,
                ),
        );

        // create new syncMap
        let _sm = Object.fromEntries(syncMap.value);
        for (const entry of syncPriorityContentOnly || []) {
            const _id = this.syncMapEntryKey(entry.syncPriority, entry.contentOnly || false);
            if (
                !Object.values(_sm).find(
                    (v) =>
                        v.syncPriority == entry.syncPriority && v.contentOnly == entry.contentOnly,
                )
            )
                syncMap.value.set(_id, {
                    id: _id,
                    types:
                        this.options.docTypes
                            ?.filter(
                                (d) =>
                                    d.syncPriority == entry.syncPriority &&
                                    d.contentOnly == entry.contentOnly,
                            )
                            .map((d) => {
                                return d.type;
                            }) || [],
                    contentOnly: entry.contentOnly,
                    groups: groups,
                    syncPriority: entry.syncPriority,
                    blocks: [{ blockStart: 0, blockEnd: 0 }],
                });
        }

        // check if groups has been updated
        _sm = Object.fromEntries(syncMap.value);
        for (const k of Object.values(_sm)) {
            if (!_.isEqual(groups, k.groups)) {
                const newGroups = _.difference(groups, k.groups);
                const removeGroups = _.difference(k.groups, groups);

                const _id = this.syncMapEntryKey(k.syncPriority, k.contentOnly || false);

                if (
                    newGroups &&
                    newGroups.length > 0 &&
                    !Object.values(_sm).find((v) => _.isEqual(v.groups, newGroups))
                )
                    syncMap.value.set(_id, {
                        ..._.cloneDeep(k),
                        id: _id,
                        groups: _.cloneDeep(newGroups),
                        blocks: [{ blockStart: 0, blockEnd: 0 }],
                    });
                else if (removeGroups && removeGroups.length > 0) {
                    const _groups = k.groups.filter((g) => !removeGroups.includes(g));
                    syncMap.value.set(k.id, {
                        ..._.cloneDeep(k),
                        groups: _.cloneDeep(_groups),
                    });
                }
            }
        }

        // check if types has been updated
        _sm = Object.fromEntries(syncMap.value);
        for (const k of Object.values(_sm)) {
            const types = this.options.docTypes
                ?.filter((d) => k.syncPriority == d.syncPriority && k.contentOnly == d.contentOnly)
                .map((d) => d.type);
            if (!_.isEqual(types, k.types)) {
                const newTypes = _.difference(types || [], k.types);
                const removeTypes = _.difference(k.types, types || []);

                const _id = this.syncMapEntryKey(k.syncPriority, k.contentOnly || false);

                if (
                    newTypes &&
                    newTypes.length > 0 &&
                    !Object.values(_sm).find((v) => _.isEqual(v.types, newTypes))
                )
                    syncMap.value.set(_id, {
                        ..._.cloneDeep(k),
                        id: _id,
                        types: _.cloneDeep(newTypes),
                        blocks: [{ blockStart: 0, blockEnd: 0 }],
                    });
                else if (removeTypes && removeTypes.length > 0) {
                    const _types = k.types.filter((g) => !removeTypes.includes(g));
                    syncMap.value.set(k.id, {
                        ..._.cloneDeep(k),
                        types: _.cloneDeep(_types),
                    });
                }
            }
        }

        // cleanup syncMaps
        _sm = Object.fromEntries(syncMap.value);
        const outDated = Object.values(_sm).filter(
            (d) =>
                !syncPriorityContentOnly?.find(
                    (s) => s.syncPriority == d.syncPriority && s.contentOnly == d.contentOnly,
                ),
        );
        for (const k of outDated || []) {
            syncMap.value.delete(k.id);
        }

        return syncMap;
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

    /**
     * Sort queue according to gapEnd and syncPriority
     * @param queue - queue of requests
     * @returns
     */
    sortQueue(queue: Array<QueueReqEntry>) {
        // sort queue according to gapEnd (if gapEnd is 0 move down in queue)
        queue.sort((a) => {
            if (a.query.from == 0) return 1;
            else return -1;
        });
        // sort queue according to syncPriority
        return queue.sort((a, b) => a.syncPriority - b.syncPriority);
    }

    /**
     * Calculate the sync entry keyskeys
     * @returns
     */
    syncMapEntryKey(syncPriority: number, contentOnly: boolean): string {
        return `${syncPriority}${contentOnly ? "_contentOnly" : ""}_${db.uuid()}`;
    }
}
