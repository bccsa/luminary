import { destroyAllDocs } from "./src/db/db.seedingFunctions";

export default async function () {
    await destroyAllDocs();
}
