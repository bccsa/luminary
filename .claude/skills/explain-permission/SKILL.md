---
name: explain-permission
description: Trace why a user can or cannot perform a given action on a given doc type — walking through their group membership, the ACL entries on those groups, the resulting AccessMap, and the verifyAccess decision. Use when the user asks "why can/can't user X do Y to a Z", "permission seems wrong", "ACL not taking effect", "explain access for…", or similar.
---

# explain-permission

The Luminary permission system has four layers, and the answer to "why was access granted/denied" almost always lives in one of them. This skill walks them in order and reports where the decision was made.

## The four layers

1. **User → Groups** (`User.memberOf`): which groups the user is in.
2. **Group ACL entries** (`Group.acl[]`): each entry is `{ type: DocType, groupId: Uuid, permission: AclPermission[] }` — saying "members of *this* group get *these permissions* on docs of *this type* in *that group*".
3. **AccessMap derivation** (`PermissionSystem.getAccessMap(userGroups)`): builds `Map<groupId, Map<DocType, Map<AclPermission, boolean>>>` by walking the ACL graph including nested-group inheritance.
4. **verifyAccess decision** (`PermissionSystem.verifyAccess(groups, docType, permission, userGroups, "any"|"all")`): the call site that consults the AccessMap with the doc's own `memberOf` and chooses any/all semantics.

The bug is almost always at layer 2 or 3 — wrong ACL entry, or unexpected inheritance. Layer 1 is usually obvious, layer 4 is usually right.

## What you need from the user before starting

- **The user** (email or user id, or just "the test user").
- **The action** (`View`, `Edit`, `Translate`, `Publish`, `Assign`, `Delete`).
- **The doc type** (e.g. `Post`, `Content`, `Group`).
- The **doc id** or its `memberOf` group(s) if known.
- Whether they're using **api-side** evaluation (change request rejection) or **client-side** (UI disabled / sync filtered).

If the report is "test user can't see something they should", that's `View` on the doc type, observed client-side.

## Procedure

### 1. Locate the User doc

The user's group membership is on their User doc. Find it via:

- email — `email-type-index.json` design doc supports this query
- externalUserId / providerId — `externalUserId-type-index.json`

Read `User.memberOf` (an array of group IDs). That's layer 1.

### 2. Read the AccessMap (if running)

If the API is running and the user is logged in, their AccessMap is the source of truth. It's delivered via Socket.io's `clientConfig` event and lives in the client's `localStorage` (`accessMap` key managed by `useLocalStorage` in `shared/src/permissions/permissions.ts`).

Client-side check (user to run, in DevTools):

```js
JSON.parse(localStorage.getItem("accessMap"))
```

The structure is `{ [groupId]: { [docType]: { [permission]: boolean } } }`. If the user's `accessMap` has `{ <docMemberOfGroupId>: { <DocType>: { View: true } } }`, View is granted. If not, denied.

### 3. Read the Group docs to understand layer 2

For each group in `User.memberOf`, fetch the Group doc:

```sh
curl -u admin:<pw> http://localhost:5984/<db>/<groupId>
```

Inspect `Group.acl[]`. Each entry says: "members of `this.groupId` (the entry's groupId) get `this.permission` on `this.type` docs that belong to this Group doc."

Trace:

- The doc the user is acting on belongs to group **G** (in its `memberOf`).
- The user is a member of group **U1, U2…**.
- Look at **G**'s `acl[]`. Is there an entry with `groupId ∈ {U1, U2, …}` and `type = <DocType>` and `permission ⊇ [<requested>]`?
- If yes → granted.
- If no → check inherited access. Group nesting: G's parent groups' ACL entries (`G.memberOf`) also apply. Walk up.

### 4. Server-side: replay verifyAccess

For change-request validation, the entry point is `PermissionSystem.verifyAccess(doc.memberOf, docType, permission, user.memberOf, "any" | "all")`.

- `"any"` mode: granted if any of the doc's memberOf groups grants the user permission.
- `"all"` mode: granted only if all of them do.

For tag assignment, the check is `"all"` against `tags` — the user must have View on every tag.

Search `api/src/changeRequests/validateChangeRequestAccess.ts` for the exact `verifyAccess` call relevant to the doc type to find the mode used.

### 5. Common gotchas

Flag any of these if you spot them:

- **AccessMap is stale.** If the user's groups changed but they haven't reconnected, their AccessMap is the old one. The fix is a Socket.io reconnect (the server replaces the map wholesale on `clientConfig`).
- **`PermissionSystem` not initialized.** `PermissionSystem.init(dbService)` runs at API boot. If a test forgot to await it, all `verifyAccess` calls return false.
- **Anonymous user.** `AuthIdentityService.resolveOrDefault` returns an anonymous identity with `getDefaultGroups()` if no token. Check `getDefaultGroups` to see what anonymous users can do.
- **`accessMapToGroups` for sync filtering** — it's the inverse: given a permission, returns the groups the user has it on, per docType. Used by `QueryService` to inject `memberOf.$in` into sync queries. If a doc isn't syncing, this is the layer that filters it out.

## Report structure

```
User: <email / id>
Action: <permission> on <DocType>
Doc memberOf: [<group ids, with names if known>]
User memberOf: [<group ids, with names if known>]

Trace:
  User groups:           <list>
  Doc lives in groups:   <list>
  Relevant ACL entries:  
    - Group <docGroup> grants <permission> on <DocType> to <granteeGroup>  (user is member?  YES/NO)
    - ...
  Inherited via nesting? <yes/no, path>
  
Decision: GRANTED / DENIED
Reason: <one-line>

If decision contradicts user's expectation, check:
  - AccessMap freshness (reconnect)
  - verifyAccess mode (any/all) at the call site: <file:line>
  - getDefaultGroups (anonymous path)
```

## What this skill is NOT

- Not a permission editor. The user owns ACL changes.
- Not a User doc creator. Don't add anyone to a group.
- Not for storage permissions. S3 bucket access is encoded on `Storage` docs and checked via the `View` permission on those — same mechanism, but if the user asks about bucket access specifically, mention `api/src/endpoints/storageStatus.controller.ts`.
