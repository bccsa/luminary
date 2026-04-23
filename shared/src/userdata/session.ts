import { ref } from "vue";
import type { Uuid } from "../types";

/**
 * The authenticated, provisioned user's id (the `_id` of their User doc
 * in content-db), as resolved server-side and sent down in `clientConfig`
 * on socket connect. Null when anonymous or before first connect.
 *
 * This is the partition key for every user-data write. The userData API
 * reads from here to construct `_id`s — it is never supplied by the
 * caller. Apps should treat this ref as read-only; the socket handler
 * owns updates.
 */
export const currentUserId = ref<Uuid | null>(null);
