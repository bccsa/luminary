// import { destroyAllDocs } from "./src/db/db.seedingFunctions";

export default async function () {
    // await destroyAllDocs();
    // Note: Destroying documents does not delete them from the database, but marks them as deleted.
    // This does not work well with testing where we reuse the testing database (i.e. local testing
    // on your computer) as CouchDB / nano complains that the document is deleted, and hence cannot
    // be created. In real life scenarios a recreating a deleted document should never occur, and
    // if it does this would be an exception that should be logged to an error log instead of
    // being processed.
    // It therefore does not work to destroy our testing data set for local testing - the developer
    // can rather delete the testing database on his computer once in a while if it gets too big.
}
