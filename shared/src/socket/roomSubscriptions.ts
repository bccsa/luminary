import { watch } from "vue";
import { DocType } from "../types";
import { getSocket, isConnected } from "./socketio";

/**
 * Subscriber-tracked Socket.io room manager.
 *
 * Socket.io rooms are `${docType}-${group}` server-side, but the client only ever
 * names docTypes — the server expands each to the rooms the user's accessMap
 * grants (plus the matching `deleteCmd-${group}` rooms). This manager tracks
 * **which subscriber wants which docType** (not a bare ref-count) so a room is
 * left only when its *last* subscriber releases it: one HybridQuery disposing can
 * never cut off another query (or sync) still using the same docType.
 *
 * - `subscribeRooms(types)` — used by HybridQuery for non-synced query types; one
 *   fresh token per live generation, released on rebuild/dispose.
 * - `setBaseRooms(types)` — used by sync under one stable token; the reactive set
 *   of synced-type rooms, diffed on every `syncList` change.
 * - `initRoomSubscriptions()` — re-joins every still-wanted room on (re)connect,
 *   since the server drops room memberships on disconnect.
 */

// Per docType, the set of subscriber tokens currently wanting live updates for it.
const _wanted = new Map<DocType, Set<symbol>>();
// sync's single stable token (its room set is replaced wholesale via setBaseRooms).
const BASE_TOKEN = Symbol("sync-base");

function joinedDocTypes(): DocType[] {
    const out: DocType[] = [];
    _wanted.forEach((tokens, dt) => {
        if (tokens.size) out.push(dt);
    });
    return out;
}

function emit(event: "joinRooms" | "leaveRooms", types: DocType[]): void {
    if (!types.length) return;
    getSocket().emit(event, { docTypes: types });
}

function claim(token: symbol, type: DocType): void {
    let set = _wanted.get(type);
    if (!set) {
        set = new Set();
        _wanted.set(type, set);
    }
    const wasEmpty = set.size === 0;
    set.add(token);
    if (wasEmpty) emit("joinRooms", [type]); // empty → non-empty: first subscriber joins
}

function release(token: symbol, type: DocType): void {
    const set = _wanted.get(type);
    if (!set || !set.delete(token)) return; // not present → idempotent no-op
    if (set.size === 0) {
        _wanted.delete(type);
        emit("leaveRooms", [type]); // non-empty → empty: last subscriber leaves
    }
}

/**
 * Subscribe to live updates for the given docTypes. Returns an **idempotent**
 * disposer that releases THIS subscription only. Safe to call the disposer more
 * than once (e.g. a rebuild + dispose race) — it never double-removes or triggers
 * a spurious leave.
 */
export function subscribeRooms(types: DocType[]): () => void {
    const token = Symbol("room-sub");
    const unique = Array.from(new Set(types));
    unique.forEach((t) => claim(token, t));
    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        unique.forEach((t) => release(token, t));
    };
}

let _baseTypes: DocType[] = [];

/**
 * Replace sync's set of subscribed docTypes (held under one stable token). Diffs
 * against the previous set — joins newly-added docTypes, leaves removed ones —
 * emitting only as a room's subscriber set crosses empty↔non-empty (so a docType
 * also held by a HybridQuery stays joined).
 */
export function setBaseRooms(types: DocType[]): void {
    const next = Array.from(new Set(types));
    const nextSet = new Set(next);
    const prevSet = new Set(_baseTypes);
    next.forEach((t) => {
        if (!prevSet.has(t)) claim(BASE_TOKEN, t);
    });
    _baseTypes.forEach((t) => {
        if (!nextSet.has(t)) release(BASE_TOKEN, t);
    });
    _baseTypes = next;
}

let _watching = false;

/**
 * Start re-joining every still-wanted room whenever the socket (re)connects. The
 * server drops a socket's room memberships on disconnect, so the full desired set
 * must be re-emitted on reconnect. Registered once at startup.
 */
export function initRoomSubscriptions(): void {
    if (_watching) return;
    _watching = true;
    watch(isConnected, (connected) => {
        if (connected) emit("joinRooms", joinedDocTypes());
    });
}

/** @internal Read-only view of the subscriber map, for tests/debug. */
export function _roomSubscriptionsState(): ReadonlyMap<DocType, ReadonlySet<symbol>> {
    return _wanted;
}
