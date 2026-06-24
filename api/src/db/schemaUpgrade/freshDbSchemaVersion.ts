/**
 * The schema version a fresh database (no `dbSchema` doc) is stamped at by `initSchemaVersion`.
 *
 * Deliberately set to ONE BELOW the newest FTS-backfill upgrade (`v18`) rather than the absolute
 * latest, so that on first startup the upgrade chain still runs `v18` and computes the
 * server-authoritative `fts` index over the freshly-seeded User and Redirect docs. Seeding writes
 * raw JSON via `db.upsertDoc` (it bypasses `processUserDto`/`processRedirectDto`), so seeded docs
 * have no `fts` until a backfill runs — without this, a fresh DB's seeded users/redirects would
 * never be findable by the strict server-side `/fts` search.
 *
 * `v18` only touches the DB (no S3), so it is safe to run unconditionally on a fresh DB — unlike
 * `v17` (ThumbHash backfill, needs S3). When adding a new upgrade, set this to the version just
 * below the newest upgrade that must run over seeded data, and double-check that upgrade is safe
 * to execute against a fresh database.
 */
export const FRESH_DB_SCHEMA_VERSION = 17;
