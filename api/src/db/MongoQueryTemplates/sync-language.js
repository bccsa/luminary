// Validation template for sync queries

module.exports = {
    selector: {
        updatedTimeUtc: {
            $lt: (val) => typeof val === "number",
        },
        type: (val) => typeof val === "string",
        memberOf: {
            $elemMatch: {
                $in: (val) => Array.isArray(val) && val.every((v) => typeof v === "string"),
            },
        },
    },
    limit: 100,
    sort: [{ updatedTimeUtc: "desc" }],
    execution_stats: (val) => typeof val === "boolean",
    use_index: "sync-language-index",
};
