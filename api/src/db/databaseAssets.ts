import * as path from "path";

/** Explicit database boundaries: shared bootstrap must never discover owner-scoped assets. */
export const CONTENT_DESIGN_DOCS_DIR = path.join(__dirname, "designDocs", "content");
export const CONTENT_SEED_DOCS_DIR = path.join(__dirname, "seedingDocs", "content");
export const USER_DESIGN_DOCS_DIR = path.join(__dirname, "designDocs", "user");
