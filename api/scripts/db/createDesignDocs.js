/* eslint-env node */
const nano = require("nano");

// const dbConnectionstring = process.argv[2];
// const database = process.argv[3];
const dbConnectionstring = "http://admin:12345678@127.0.0.1:5984";
const database = "ac-local";

const db = nano(dbConnectionstring).use(database);

// Create sync views
upsertDoc({
    _id: "_design/sync",
    views: {
        updatedTimeUtc: {
            map: "function (doc) {\n  if (doc.updatedTimeUtc) {\n    emit(doc.updatedTimeUtc, doc.updatedTimeUtc);\n  }\n}",
        },
        changelogUpdatedTimeUtc: {
            map: 'function (doc) {\n  if (doc.updatedTimeUtc && doc.type && doc.type === "changelogEntry") {\n    emit(doc.updatedTimeUtc, doc.updatedTimeUtc);\n  }\n}',
        },
    },
}).then(() => {
    console.log("done");
});

/**
 * Insert or update document
 */
function upsertDoc(doc) {
    return new Promise((resolve) => {
        db.get(doc._id)
            .then(async (existing) => {
                console.log(existing);
                doc._rev = existing._rev;
                resolve(await db.insert(doc));
            })
            // Create new doc if it does not exit
            .catch(async () => {
                resolve(await db.insert(doc));
            });
    });
}

// db.insert({
//     _id: "_design/sync",
//     views: {
//         updatedTimeUtc: {
//             map: "function (doc) {\n  if (doc.updatedTimeUtc) {\n    emit(doc.updatedTimeUtc, doc.updatedTimeUtc);\n  }\n}",
//         },
//         changelogUpdatedTimeUtc: {
//             map: 'function (doc) {\n  if (doc.updatedTimeUtc && doc.type && doc.type === "changelogEntry") {\n    emit(doc.updatedTimeUtc, doc.updatedTimeUtc);\n  }\n}',
//         },
//     },
// });
