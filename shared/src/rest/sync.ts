import { ApiSearchQuery, getRest } from "./RestApi";
import { DocType } from "../types";
import { db, SyncMap, syncMap, SyncMapEntry } from "../db/database";
import { accessMap } from "../permissions/permissions";
import { watch } from "vue";
import _ from "lodash";
import { config } from "../config";

type MissingGap = {
    gapStart: number;
    gapEnd: number;
};

export class Sync {
    /**
     * Create a new Sync instance
     * @param options - Options
     */
    constructor() {
        watch(
            accessMap.value,
            async () => {
                await this.calcSyncMap();
            },
            { immediate: true },
        );

        config.appLanguageIdsAsRef &&
            watch(
                config.appLanguageIdsAsRef,
                async () => {
                    await this.clientDataReq();
                },
                { deep: true },
            );
    }

    async clientDataReq() {
        await this.calcSyncMap();

        const _sm = Object.fromEntries(syncMap.value);
        const _sm_sorted = Object.values(_sm).sort((a, b) => a.syncPriority - b.syncPriority);
        for (const v of _sm_sorted) {
            const query: ApiSearchQuery = {
                apiVersion: "0.0.0",
                from: 0,
                types: v.types as DocType[],
                groups: v.groups,
                languages: v.languages,
                contentOnly: v.contentOnly,
                limit: 100,
            };
            const blocks = v.blocks;
            const newest = blocks.sort((a: SyncMapEntry, b: SyncMapEntry) => {
                if (!a || !b) return 0;
                return b.blockStart - a.blockStart;
            })[0];

            query.from = newest?.blockStart || 0;

            await this.req(query, v.id);
        }
    }

    /**
     * Query the api
     * @param query - query to send
     * @param id   - id of the syncMap entry
     */
    async req(query: ApiSearchQuery, id: string): Promise<any> {
        const data = await getRest().search(query);
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
            const languages = syncMap.value.get(id)?.languages;
            const contentOnly = syncMap.value.get(id)?.contentOnly;
            const syncPriority = syncMap.value.get(id)?.syncPriority;
            const skipWaitForLanguageSync = syncMap.value.get(id)?.skipWaitForLanguageSync;

            const _sm = Object.fromEntries(syncMap.value);
            const parent = Object.values(_sm).find(
                (f) =>
                    f.contentOnly == contentOnly &&
                    f.syncPriority == syncPriority &&
                    f.skipWaitForLanguageSync == skipWaitForLanguageSync &&
                    !_.isEqual(f, entry),
            );

            if (!parent) return;
            const newGroups = Array.from(new Set([...(parent.groups || []), ...(groups || [])]));
            const newTypes = Array.from(new Set([...(parent.types || []), ...(types || [])]));
            const newLanguages = Array.from(
                new Set([...(parent.languages || []), ...(languages || [])]),
            );

            syncMap.value.set(parent.id, {
                ..._.cloneDeep(parent),
                groups: _.cloneDeep(newGroups),
                types: _.cloneDeep(newTypes),
                languages: _.cloneDeep(newLanguages),
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

        const syncPriorityContentOnly = config.docTypes?.filter(
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
                if (
                    entry.skipWaitForLanguageSync ||
                    (config.appLanguageIdsAsRef?.value &&
                        config.appLanguageIdsAsRef?.value.length > 0)
                )
                    syncMap.value.set(_id, {
                        id: _id,
                        types:
                            config.docTypes
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
                        skipWaitForLanguageSync: entry.skipWaitForLanguageSync,
                        languages: entry.skipWaitForLanguageSync
                            ? []
                            : config.appLanguageIdsAsRef?.value || [],
                        syncPriority: entry.syncPriority,
                        blocks: [{ blockStart: 0, blockEnd: 0 }],
                    });
        }

        // check if groups has been updated
        _sm = Object.fromEntries(syncMap.value);
        for (const k of Object.values(_sm)) {
            this.compareEntires(_sm, k, groups, "groups");
        }

        // check if types has been updated
        _sm = Object.fromEntries(syncMap.value);
        for (const k of Object.values(_sm)) {
            const types = config.docTypes
                ?.filter((d) => k.syncPriority == d.syncPriority && k.contentOnly == d.contentOnly)
                .map((d) => d.type);
            this.compareEntires(_sm, k, types || [], "types");
        }

        // check if languages has been updated
        _sm = Object.fromEntries(syncMap.value);
        for (const k of Object.values(_sm)) {
            if (!k.skipWaitForLanguageSync)
                this.compareEntires(_sm, k, config.appLanguageIdsAsRef?.value || [], "languages");
        }

        // cleanup syncMaps
        _sm = Object.fromEntries(syncMap.value);
        const outDated = Object.values(_sm).filter(
            (d) =>
                !syncPriorityContentOnly?.find(
                    (s) => s.syncPriority == d.syncPriority && s.contentOnly == d.contentOnly,
                ) ||
                d.groups?.length == 0 ||
                d.types?.length == 0,
        );
        for (const k of outDated || []) {
            syncMap.value.delete(k.id);
        }

        return syncMap;
    }

    /**
     * Compare the syncMap entries and update the syncMap
     * @param _sm - syncMap (Object.fromEntries)
     * @param k - syncMap entry
     * @param gtl - Array of Groups | Types | Languages
     * @param key - groups | types | languages
     */
    compareEntires(_sm: Object, k: SyncMap, gtl: Array<string>, key: keyof SyncMap) {
        if (!_.isEqual(gtl, k.types)) {
            const newT = _.difference(gtl || [], k[key] as Array<string>);
            const removeT = _.difference(k[key] as Array<string>, gtl || []);

            const _id = this.syncMapEntryKey(k.syncPriority, k.contentOnly || false);

            if (
                newT &&
                newT.length > 0 &&
                !Object.values(_sm).find(
                    (v) =>
                        _.isEqual(v.types, newT) &&
                        k.syncPriority == v.syncPriority &&
                        k.contentOnly == v.contentOnly,
                )
            )
                syncMap.value.set(_id, {
                    ..._.cloneDeep(k),
                    id: _id,
                    [key]: _.cloneDeep(newT),
                    blocks: [{ blockStart: 0, blockEnd: 0 }],
                });

            if (removeT && removeT.length > 0) {
                const _F = k[key] as Array<string>;
                const _T = _F.filter((g) => !removeT.includes(g));
                syncMap.value.set(k.id, {
                    ..._.cloneDeep(k),
                    [key]: _.cloneDeep(_T),
                });
            }
        }
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
     * Calculate the sync entry keys
     * @returns
     */
    syncMapEntryKey(syncPriority: number, contentOnly: boolean): string {
        return `${syncPriority}${contentOnly ? "_contentOnly" : ""}_${db.uuid()}`;
    }
}
