#!/bin/bash

# Navigate to the api directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Load environment variables
if [ -f .env ]; then
  DB_CONNECTION_STRING=$(grep '^DB_CONNECTION_STRING=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
  DB_DATABASE=$(grep '^DB_DATABASE=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
else
  echo "Error: .env file not found in the api directory at $DIR."
  exit 1
fi

if [ -z "$DB_CONNECTION_STRING" ] || [ -z "$DB_DATABASE" ]; then
  echo "Error: DB_CONNECTION_STRING or DB_DATABASE not found in .env"
  exit 1
fi

# ── Helper: extract a scalar field from a JSON string ────────────────────────
# Usage: json_field "$json" "fieldName"
json_field() {
  local _json="$1" _field="$2"
  echo "$_json" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{
      const v=JSON.parse(b)['$_field'];
      process.stdout.write(v!=null?String(v):'');
    });
  "
}

# ── Helper: collect group mappings ───────────────────────────────────────────
# Sets global: group_mappings_json
collect_group_mappings() {
  local -a _gm_objects=()

  while true; do
    read -p "  Group ID (or blank to finish): " gm_groupId
    if [ -z "$gm_groupId" ]; then break; fi

    echo "  Condition type for '$gm_groupId':"
    echo "    1) authenticated  — any successfully authenticated user"
    echo "    2) claimEquals    — a JWT claim equals a specific value"
    echo "    3) claimIn        — a JWT claim is one of a list of values"
    read -p "  Select [1-3]: " gm_cond_choice

    local gm_condType="" gm_claimPath="" gm_value="" gm_values_json="[]"

    case "$gm_cond_choice" in
      1) gm_condType="authenticated" ;;
      2)
        gm_condType="claimEquals"
        read -p "  Claim path (e.g., roles): " gm_claimPath
        read -p "  Claim value (exact match): " gm_value
        ;;
      3)
        gm_condType="claimIn"
        read -p "  Claim path (e.g., roles): " gm_claimPath
        echo "  Enter values one per line. Leave blank to finish."
        local -a _vals=()
        while true; do
          read -p "    Value: " gm_val
          if [ -z "$gm_val" ]; then break; fi
          _vals+=("$gm_val")
        done
        gm_values_json=$(printf '%s\n' "${_vals[@]}" | node -e "
          const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
          process.stdout.write(JSON.stringify(lines));
        ")
        ;;
      *)
        echo "  Invalid choice, skipping."
        continue
        ;;
    esac

    local _m
    _m=$(GM_GROUP_ID="$gm_groupId" GM_COND_TYPE="$gm_condType" \
      GM_CLAIM_PATH="$gm_claimPath" GM_VALUE="$gm_value" GM_VALUES_JSON="$gm_values_json" \
      node -e "
        const cond = { type: process.env.GM_COND_TYPE };
        if (process.env.GM_CLAIM_PATH) cond.claimPath = process.env.GM_CLAIM_PATH;
        if (process.env.GM_VALUE)      cond.value      = process.env.GM_VALUE;
        if (process.env.GM_COND_TYPE === 'claimIn') cond.values = JSON.parse(process.env.GM_VALUES_JSON);
        process.stdout.write(JSON.stringify({ groupId: process.env.GM_GROUP_ID, conditions: [cond] }));
      ")

    _gm_objects+=("$_m")
  done

  group_mappings_json=$(printf '%s\n' "${_gm_objects[@]}" | node -e "
    const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
    process.stdout.write(JSON.stringify(lines.map(l => JSON.parse(l))));
  ")
  if [ -z "$group_mappings_json" ]; then group_mappings_json="[]"; fi
}

# ── Helper: apply group ACL updates ─────────────────────────────────────────
# Args: $1 = new memberOf JSON array, $2 = old memberOf JSON array (optional)
apply_group_acl_updates() {
  local new_mo_json="$1"
  local old_mo_json="${2:-}"

  echo ""
  echo "Updating group ACL entries for AuthProvider access..."

  # Add/update ACL entry for each group in new memberOf
  local -a _new_groups=()
  while IFS= read -r _g; do
    [ -n "$_g" ] && _new_groups+=("$_g")
  done < <(echo "$new_mo_json" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ JSON.parse(b).forEach(g=>console.log(g)); });
  ")

  for _gid in "${_new_groups[@]}"; do
    local _gdoc _gexists _aperms _ugdoc _gresp
    _gdoc=$(curl -s -X GET "$DB_CONNECTION_STRING/$DB_DATABASE/$_gid")
    _gexists=$(echo "$_gdoc" | node -e "
      let b=''; process.stdin.on('data',d=>b+=d);
      process.stdin.on('end',()=>{ process.stdout.write(JSON.parse(b).error?'false':'true'); });
    ")
    if [ "$_gexists" = "false" ]; then
      echo "  Warning: group '$_gid' not found — skipping."; continue
    fi

    if [ "$_gid" = "group-super-admins" ]; then
      _aperms='["view","create","edit","delete","assign"]'
    else
      _aperms='["view"]'
    fi

    _ugdoc=$(ACL_GID="$_gid" ACL_PERMS="$_aperms" node -e "
      let b=''; process.stdin.on('data',d=>b+=d);
      process.stdin.on('end',()=>{
        const doc=JSON.parse(b), gid=process.env.ACL_GID;
        const perms=JSON.parse(process.env.ACL_PERMS);
        const acl=(doc.acl||[]).filter(e=>!(e.type==='authProvider'&&e.groupId===gid));
        acl.push({type:'authProvider',groupId:gid,permission:perms});
        doc.acl=acl;
        process.stdout.write(JSON.stringify(doc));
      });
    " <<< "$_gdoc")

    _gresp=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/$_gid" \
      -H "Content-Type: application/json" -d "$_ugdoc")
    echo "  Group '$_gid':"
    if command -v jq &> /dev/null; then echo "$_gresp" | jq .
    else echo "  $_gresp"; fi
  done

  # Remove AuthProvider ACL entry from groups no longer in memberOf
  if [ -n "$old_mo_json" ]; then
    local -a _removed=()
    while IFS= read -r _g; do
      [ -n "$_g" ] && _removed+=("$_g")
    done < <(OLD_MO="$old_mo_json" NEW_MO="$new_mo_json" node -e "
      const o=JSON.parse(process.env.OLD_MO), n=JSON.parse(process.env.NEW_MO);
      o.filter(g=>!n.includes(g)).forEach(g=>console.log(g));
    ")

    for _rid in "${_removed[@]}"; do
      local _gdoc _gexists _ugdoc _gresp
      _gdoc=$(curl -s -X GET "$DB_CONNECTION_STRING/$DB_DATABASE/$_rid")
      _gexists=$(echo "$_gdoc" | node -e "
        let b=''; process.stdin.on('data',d=>b+=d);
        process.stdin.on('end',()=>{ process.stdout.write(JSON.parse(b).error?'false':'true'); });
      ")
      if [ "$_gexists" = "false" ]; then
        echo "  Warning: group '$_rid' not found — skipping."; continue
      fi

      _ugdoc=$(REM_GID="$_rid" node -e "
        let b=''; process.stdin.on('data',d=>b+=d);
        process.stdin.on('end',()=>{
          const doc=JSON.parse(b), gid=process.env.REM_GID;
          doc.acl=(doc.acl||[]).filter(e=>!(e.type==='authProvider'&&e.groupId===gid));
          process.stdout.write(JSON.stringify(doc));
        });
      " <<< "$_gdoc")

      _gresp=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/$_rid" \
        -H "Content-Type: application/json" -d "$_ugdoc")
      echo "  Removed AuthProvider ACL from '$_rid':"
      if command -v jq &> /dev/null; then echo "$_gresp" | jq .
      else echo "  $_gresp"; fi
    done
  fi
}

# ── Menu ──────────────────────────────────────────────────────────────────────

echo "====================================="
echo "   Luminary Auth Setup"
echo "====================================="
echo ""
echo "  1) Add Auth Provider"
echo "  2) Modify Auth Provider"
echo "  3) Configure Default Groups"
echo "  4) Add Auth Provider + Configure Default Groups"
echo "  5) Repair ACL entries for existing Auth Provider"
echo ""
read -p "Select an option [1-5]: " menu_choice

case "$menu_choice" in
  1) do_add_provider=true;  do_modify_provider=false; do_groups=false; do_repair_acl=false ;;
  2) do_add_provider=false; do_modify_provider=true;  do_groups=false; do_repair_acl=false ;;
  3) do_add_provider=false; do_modify_provider=false; do_groups=true;  do_repair_acl=false ;;
  4) do_add_provider=true;  do_modify_provider=false; do_groups=true;  do_repair_acl=false ;;
  5) do_add_provider=false; do_modify_provider=false; do_groups=false; do_repair_acl=true  ;;
  *) echo "Invalid option. Exiting."; exit 1 ;;
esac

# ── Add Auth Provider ─────────────────────────────────────────────────────────

if [ "$do_add_provider" = true ]; then
  echo ""
  echo "====================================="
  echo "   Add AuthProvider to CouchDB"
  echo "====================================="
  echo ""

  read -p "Domain (e.g., yourdomain.auth0.com): " domain
  if [ -z "$domain" ]; then echo "Domain is required."; exit 1; fi

  read -p "Audience (e.g., https://api.yourdomain.com): " audience
  if [ -z "$audience" ]; then echo "Audience is required."; exit 1; fi

  read -p "Client ID: " clientId
  if [ -z "$clientId" ]; then echo "Client ID is required."; exit 1; fi

  read -p "Display label (e.g., 'Sign in with Google') [optional]: " label

  echo ""
  echo "Which groups should be able to view this auth provider?"
  echo "  Typically your default public groups, e.g. group-public-users."
  echo "  super-admins are always included."
  echo "  Enter one group ID per line. Leave blank to finish."
  echo ""

  provider_member_of=("group-super-admins")
  while true; do
    read -p "  Group ID (or blank to finish): " pm_group
    if [ -z "$pm_group" ]; then break; fi
    provider_member_of+=("$pm_group")
  done

  provider_member_of_json=$(printf '%s\n' "${provider_member_of[@]}" | node -e "
    const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
    process.stdout.write(JSON.stringify(lines));
  ")

  echo ""
  echo "Custom JWT claim namespace (optional)."
  echo "  e.g. https://yourdomain.com/metadata"
  read -p "Claim namespace [optional]: " claimNamespace

  echo ""
  echo "User field mappings: override the JWT claim names for standard user fields."
  echo "  Press Enter to accept the OIDC defaults (sub, email, name)."
  read -p "  externalUserId claim name [default: sub]: "   ufm_externalUserId
  read -p "  email claim name         [default: email]: "  ufm_email
  read -p "  name claim name          [default: name]: "   ufm_name

  echo ""
  echo "Group mappings: rules that assign authenticated users to local groups."
  echo "  Enter mappings one by one. Leave group ID blank to finish."
  echo ""
  collect_group_mappings

  export SCRIPT_DOMAIN="$domain"
  export SCRIPT_AUDIENCE="$audience"
  export SCRIPT_CLIENT_ID="$clientId"
  export SCRIPT_LABEL="$label"
  export SCRIPT_PROVIDER_MEMBER_OF="$provider_member_of_json"
  export SCRIPT_CLAIM_NAMESPACE="$claimNamespace"
  export SCRIPT_UFM_EXTERNAL_USER_ID="$ufm_externalUserId"
  export SCRIPT_UFM_EMAIL="$ufm_email"
  export SCRIPT_UFM_NAME="$ufm_name"
  export SCRIPT_GROUP_MAPPINGS="$group_mappings_json"

  payloads=$(cat << 'EOF' | node
try {
  const { randomUUID } = require("crypto");
  const providerId = randomUUID();
  const now = Date.now();
  const groupMappings    = JSON.parse(process.env.SCRIPT_GROUP_MAPPINGS  || "[]");
  const providerMemberOf = JSON.parse(process.env.SCRIPT_PROVIDER_MEMBER_OF || '["group-super-admins"]');

  const providerDoc = {
    _id: providerId, type: "authProvider",
    domain: process.env.SCRIPT_DOMAIN, audience: process.env.SCRIPT_AUDIENCE,
    clientId: process.env.SCRIPT_CLIENT_ID, memberOf: providerMemberOf, updatedTimeUtc: now
  };
  if (process.env.SCRIPT_LABEL) providerDoc.label = process.env.SCRIPT_LABEL;

  const configDoc = {
    _id: randomUUID(), type: "authProviderConfig",
    providerId, memberOf: ["group-super-admins"], updatedTimeUtc: now
  };
  if (process.env.SCRIPT_CLAIM_NAMESPACE) configDoc.claimNamespace = process.env.SCRIPT_CLAIM_NAMESPACE;
  if (groupMappings.length > 0) configDoc.groupMappings = groupMappings;

  const ufm = {};
  if (process.env.SCRIPT_UFM_EXTERNAL_USER_ID) ufm.externalUserId = process.env.SCRIPT_UFM_EXTERNAL_USER_ID;
  if (process.env.SCRIPT_UFM_EMAIL)            ufm.email           = process.env.SCRIPT_UFM_EMAIL;
  if (process.env.SCRIPT_UFM_NAME)             ufm.name            = process.env.SCRIPT_UFM_NAME;
  if (Object.keys(ufm).length > 0) configDoc.userFieldMappings = ufm;

  console.log(JSON.stringify({ provider: providerDoc, config: configDoc }));
} catch (e) { console.error("Failed to build payloads: " + e.message); process.exit(1); }
EOF
)

  if [ $? -ne 0 ]; then
    echo ""; echo "Error building payloads. Aborting."; echo "$payloads"; exit 1
  fi

  provider_payload=$(echo "$payloads" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(JSON.stringify(JSON.parse(b).provider)); });
  ")
  provider_config_payload=$(echo "$payloads" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(JSON.stringify(JSON.parse(b).config)); });
  ")

  echo ""
  echo "Generated AuthProvider payload:"
  if command -v jq &> /dev/null; then echo "$provider_payload" | jq .
  else echo "$provider_payload"; fi
  echo ""
  echo "Generated AuthProviderConfig payload:"
  if command -v jq &> /dev/null; then echo "$provider_config_payload" | jq .
  else echo "$provider_config_payload"; fi
  echo ""

  read -p "Proceed with insertion into CouchDB? (y/n): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then echo "Aborted."; exit 0; fi

  provider_id=$(echo "$provider_payload" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(JSON.parse(b)._id); });
  ")
  provider_config_id=$(echo "$provider_config_payload" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(JSON.parse(b)._id); });
  ")

  provider_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/$provider_id" \
    -H "Content-Type: application/json" -d "$provider_payload")
  echo ""; echo "AuthProvider response from CouchDB:"
  if command -v jq &> /dev/null; then echo "$provider_response" | jq .
  else echo "$provider_response"; fi

  provider_config_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/$provider_config_id" \
    -H "Content-Type: application/json" -d "$provider_config_payload")
  echo ""; echo "AuthProviderConfig response from CouchDB:"
  if command -v jq &> /dev/null; then echo "$provider_config_response" | jq .
  else echo "$provider_config_response"; fi

  apply_group_acl_updates "$provider_member_of_json"

  # ── Backfill providerId on existing users ─────────────────────────────────

  echo ""
  read -p "Backfill providerId='$provider_id' onto all existing users? (y/n): " backfill_confirm
  if [[ "$backfill_confirm" == "y" || "$backfill_confirm" == "Y" ]]; then
    echo "Fetching all user documents..."

    all_users_json=$(node -e "
const https = require('https');
const http = require('http');
const url = require('url');
const base = process.env.DB_CONNECTION_STRING;
const db = process.env.DB_DATABASE;

async function findAll() {
  const docs = [];
  let bookmark = null;
  while (true) {
    const body = JSON.stringify({ selector: { type: 'user' }, limit: 200, ...(bookmark ? { bookmark } : {}) });
    const fullUrl = \`\${base}/\${db}/_find\`;
    const parsed = url.parse(fullUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const result = await new Promise((resolve, reject) => {
      const req = lib.request({
        hostname: parsed.hostname, port: parsed.port, path: parsed.path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        auth: parsed.auth || undefined
      }, (res) => { let data = ''; res.on('data', d => data += d); res.on('end', () => resolve(JSON.parse(data))); });
      req.on('error', reject); req.write(body); req.end();
    });
    if (result.docs && result.docs.length > 0) {
      docs.push(...result.docs);
      bookmark = result.bookmark;
      if (result.docs.length < 200) break;
    } else { break; }
  }
  process.stdout.write(JSON.stringify(docs));
}
findAll().catch(e => { console.error(e.message); process.exit(1); });
" DB_CONNECTION_STRING="$DB_CONNECTION_STRING" DB_DATABASE="$DB_DATABASE")

    user_count=$(echo "$all_users_json" | node -e "
      let b=''; process.stdin.on('data',d=>b+=d);
      process.stdin.on('end',()=>{ process.stdout.write(String(JSON.parse(b).length)); });
    ")
    echo "Found $user_count user(s)."

    if [ "$user_count" -gt 0 ]; then
      echo "Updating users with providerId='$provider_id'..."
      result=$(PROVIDER_ID="$provider_id" DB_CONNECTION_STRING="$DB_CONNECTION_STRING" DB_DATABASE="$DB_DATABASE" node -e "
const https = require('https');
const http = require('http');
const url = require('url');
const base = process.env.DB_CONNECTION_STRING;
const db = process.env.DB_DATABASE;
const providerId = process.env.PROVIDER_ID;
let body = '';
process.stdin.on('data', d => body += d);
process.stdin.on('end', async () => {
  const users = JSON.parse(body);
  const bulk = users.map(u => ({ ...u, providerId }));
  const payload = JSON.stringify({ docs: bulk });
  const fullUrl = \`\${base}/\${db}/_bulk_docs\`;
  const parsed = url.parse(fullUrl);
  const lib = parsed.protocol === 'https:' ? https : http;
  const res = await new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: parsed.hostname, port: parsed.port, path: parsed.path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      auth: parsed.auth || undefined
    }, (r) => { let data = ''; r.on('data', d => data += d); r.on('end', () => resolve(JSON.parse(data))); });
    req.on('error', reject); req.write(payload); req.end();
  });
  const errors = res.filter(r => r.error);
  process.stdout.write(JSON.stringify({ total: bulk.length, errors }));
});
" <<< "$all_users_json")

      error_count=$(echo "$result" | node -e "
        let b=''; process.stdin.on('data',d=>b+=d);
        process.stdin.on('end',()=>{ process.stdout.write(String(JSON.parse(b).errors.length)); });
      ")
      if [ "$error_count" -eq 0 ]; then
        echo "Successfully updated $user_count user(s)."
      else
        echo "Completed with $error_count error(s):"
        echo "$result" | node -e "
          let b=''; process.stdin.on('data',d=>b+=d);
          process.stdin.on('end',()=>{ JSON.parse(b).errors.forEach(e=>console.log(JSON.stringify(e))); });
        "
      fi
    fi
  fi
fi

# ── Modify Auth Provider ──────────────────────────────────────────────────────

if [ "$do_modify_provider" = true ]; then
  echo ""
  echo "====================================="
  echo "   Modify Auth Provider"
  echo "====================================="
  echo ""

  providers_json=$(curl -s -X POST "$DB_CONNECTION_STRING/$DB_DATABASE/_find" \
    -H "Content-Type: application/json" \
    -d '{"selector":{"type":"authProvider"},"limit":100}')

  provider_count=$(echo "$providers_json" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(String((JSON.parse(b).docs||[]).length)); });
  ")

  if [ "$provider_count" -eq 0 ]; then
    echo "No auth providers found. Use 'Add Auth Provider' to create one."
    exit 0
  fi

  echo "Existing auth providers:"
  echo "$providers_json" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{
      JSON.parse(b).docs.forEach((p,i)=>{
        const tag = p.label ? p.label + ' — ' : '';
        console.log('  '+(i+1)+') '+tag+p.domain+' ('+p._id+')');
      });
    });
  "
  echo ""
  read -p "Select provider to modify [1-$provider_count]: " provider_choice

  if ! [[ "$provider_choice" =~ ^[0-9]+$ ]] || \
     [ "$provider_choice" -lt 1 ] || [ "$provider_choice" -gt "$provider_count" ]; then
    echo "Invalid selection. Exiting."; exit 1
  fi

  # Extract the selected provider doc
  current_provider=$(echo "$providers_json" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{
      const docs=JSON.parse(b).docs;
      process.stdout.write(JSON.stringify(docs[$(( provider_choice - 1 ))]));
    });
  ")

  current_id=$(json_field "$current_provider" _id)

  # Fetch associated AuthProviderConfig
  existing_config_res=$(curl -s -X POST "$DB_CONNECTION_STRING/$DB_DATABASE/_find" \
    -H "Content-Type: application/json" \
    -d "{\"selector\":{\"type\":\"authProviderConfig\",\"providerId\":\"$current_id\"},\"limit\":1}")

  current_config=$(echo "$existing_config_res" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ const d=JSON.parse(b); process.stdout.write(JSON.stringify(d.docs&&d.docs[0]||null)); });
  ")

  has_config=$([ "$current_config" = "null" ] && echo "false" || echo "true")

  # Initialize working variables from current values
  domain=$(json_field "$current_provider" domain)
  audience=$(json_field "$current_provider" audience)
  clientId=$(json_field "$current_provider" clientId)
  label=$(json_field "$current_provider" label)
  provider_member_of_json=$(echo "$current_provider" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(JSON.stringify(JSON.parse(b).memberOf||['group-super-admins'])); });
  ")

  claimNamespace=""
  ufm_externalUserId=""
  ufm_email=""
  ufm_name=""
  group_mappings_json="[]"

  if [ "$has_config" = "true" ]; then
    claimNamespace=$(json_field "$current_config" claimNamespace)
    ufm_externalUserId=$(echo "$current_config" | node -e "
      let b=''; process.stdin.on('data',d=>b+=d);
      process.stdin.on('end',()=>{ const d=JSON.parse(b); process.stdout.write((d.userFieldMappings&&d.userFieldMappings.externalUserId)||''); });
    ")
    ufm_email=$(echo "$current_config" | node -e "
      let b=''; process.stdin.on('data',d=>b+=d);
      process.stdin.on('end',()=>{ const d=JSON.parse(b); process.stdout.write((d.userFieldMappings&&d.userFieldMappings.email)||''); });
    ")
    ufm_name=$(echo "$current_config" | node -e "
      let b=''; process.stdin.on('data',d=>b+=d);
      process.stdin.on('end',()=>{ const d=JSON.parse(b); process.stdout.write((d.userFieldMappings&&d.userFieldMappings.name)||''); });
    ")
    group_mappings_json=$(echo "$current_config" | node -e "
      let b=''; process.stdin.on('data',d=>b+=d);
      process.stdin.on('end',()=>{ process.stdout.write(JSON.stringify(JSON.parse(b).groupMappings||[])); });
    ")
  fi

  # Save original memberOf for ACL diff
  original_member_of_json="$provider_member_of_json"

  # ── Field selection menu ──────────────────────────────────────────────────
  echo ""
  echo "Select a field to edit. Changes are staged until you confirm."
  echo "Press Q to finish and proceed."

  while true; do
    echo ""
    echo "  1) Domain              [$domain]"
    echo "  2) Audience            [$audience]"
    echo "  3) Client ID           [$clientId]"
    echo "  4) Display label       [$label]"
    echo "  5) Member-of groups    [$provider_member_of_json]"
    echo "  6) Claim namespace     [$claimNamespace]"
    echo "  7) User field mappings [externalUserId=${ufm_externalUserId:-sub}, email=${ufm_email:-email}, name=${ufm_name:-name}]"
    echo "  8) Group mappings      ($(echo "$group_mappings_json" | node -e "let b='';process.stdin.on('data',d=>b+=d);process.stdin.on('end',()=>process.stdout.write(String(JSON.parse(b).length)));") mapping(s))"
    echo "  Q) Done — proceed to update"
    echo ""
    read -p "Select [1-8 or Q]: " field_choice

    case "$field_choice" in
      1)
        read -p "Domain [$domain]: " _v
        if [ -n "$_v" ]; then domain="$_v"; fi
        ;;
      2)
        read -p "Audience [$audience]: " _v
        if [ -n "$_v" ]; then audience="$_v"; fi
        ;;
      3)
        read -p "Client ID [$clientId]: " _v
        if [ -n "$_v" ]; then clientId="$_v"; fi
        ;;
      4)
        read -p "Display label [$label] (enter a single space to clear): " _v
        if [ "$_v" = " " ]; then label=""
        elif [ -n "$_v" ]; then label="$_v"; fi
        ;;
      5)
        echo "  Current: $provider_member_of_json"
        echo "  Enter new group IDs one per line. group-super-admins is always included."
        echo "  Leave blank to finish (entering nothing keeps current value)."
        echo ""
        _new_member_of=("group-super-admins")
        _entered=false
        while true; do
          read -p "  Group ID (or blank to finish): " pm_group
          if [ -z "$pm_group" ]; then break; fi
          _new_member_of+=("$pm_group")
          _entered=true
        done
        if [ "$_entered" = true ]; then
          provider_member_of_json=$(printf '%s\n' "${_new_member_of[@]}" | node -e "
            const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
            process.stdout.write(JSON.stringify(lines));
          ")
        fi
        ;;
      6)
        read -p "Claim namespace [$claimNamespace] (enter a single space to clear): " _v
        if [ "$_v" = " " ]; then claimNamespace=""
        elif [ -n "$_v" ]; then claimNamespace="$_v"; fi
        ;;
      7)
        echo "  Current: externalUserId=${ufm_externalUserId:-sub}, email=${ufm_email:-email}, name=${ufm_name:-name}"
        echo "  Press Enter to keep current. Enter a single space to clear a field."
        read -p "  externalUserId claim [$ufm_externalUserId]: " _v
        if [ "$_v" = " " ]; then ufm_externalUserId=""
        elif [ -n "$_v" ]; then ufm_externalUserId="$_v"; fi
        read -p "  email claim [$ufm_email]: " _v
        if [ "$_v" = " " ]; then ufm_email=""
        elif [ -n "$_v" ]; then ufm_email="$_v"; fi
        read -p "  name claim [$ufm_name]: " _v
        if [ "$_v" = " " ]; then ufm_name=""
        elif [ -n "$_v" ]; then ufm_name="$_v"; fi
        ;;
      8)
        echo "  Current group mappings:"
        if command -v jq &> /dev/null; then echo "$group_mappings_json" | jq .
        else echo "$group_mappings_json"; fi
        echo ""
        read -p "  Replace all group mappings? (y/n): " _r
        if [[ "$_r" == "y" || "$_r" == "Y" ]]; then
          echo "  Enter new group mappings. Leave group ID blank to finish."
          echo ""
          collect_group_mappings
        fi
        ;;
      [Qq])
        break
        ;;
      *)
        echo "  Invalid choice."
        ;;
    esac
  done

  # Validate required fields
  if [ -z "$domain" ];   then echo "Domain is required. Aborting."; exit 1; fi
  if [ -z "$audience" ]; then echo "Audience is required. Aborting."; exit 1; fi
  if [ -z "$clientId" ]; then echo "Client ID is required. Aborting."; exit 1; fi

  # Build updated payloads — pass existing docs via stdin to avoid env var size limits
  export SCRIPT_DOMAIN="$domain"
  export SCRIPT_AUDIENCE="$audience"
  export SCRIPT_CLIENT_ID="$clientId"
  export SCRIPT_LABEL="$label"
  export SCRIPT_PROVIDER_MEMBER_OF="$provider_member_of_json"
  export SCRIPT_CLAIM_NAMESPACE="$claimNamespace"
  export SCRIPT_UFM_EXTERNAL_USER_ID="$ufm_externalUserId"
  export SCRIPT_UFM_EMAIL="$ufm_email"
  export SCRIPT_UFM_NAME="$ufm_name"
  export SCRIPT_GROUP_MAPPINGS="$group_mappings_json"

  payloads=$(echo "{\"provider\":$current_provider,\"config\":$current_config}" | node -e "
const { randomUUID } = require('crypto');
let b = ''; process.stdin.on('data', d => b += d);
process.stdin.on('end', () => {
  try {
    const existing = JSON.parse(b);
    const existingProvider = existing.provider;
    const existingConfig   = existing.config; // may be null
    const now = Date.now();
    const groupMappings    = JSON.parse(process.env.SCRIPT_GROUP_MAPPINGS || '[]');
    const providerMemberOf = JSON.parse(process.env.SCRIPT_PROVIDER_MEMBER_OF || '[\"group-super-admins\"]');

    // Merge into existing provider doc — preserves imageData, imageBucketId, etc.
    const providerDoc = {
      ...existingProvider,
      domain: process.env.SCRIPT_DOMAIN,
      audience: process.env.SCRIPT_AUDIENCE,
      clientId: process.env.SCRIPT_CLIENT_ID,
      memberOf: providerMemberOf,
      updatedTimeUtc: now
    };
    if (process.env.SCRIPT_LABEL) providerDoc.label = process.env.SCRIPT_LABEL;
    else delete providerDoc.label;

    // Update existing config doc, or create a new one if none exists
    const configBase = existingConfig || {
      _id: randomUUID(), type: 'authProviderConfig', providerId: existingProvider._id
    };
    const configDoc = { ...configBase, memberOf: ['group-super-admins'], updatedTimeUtc: now };

    if (process.env.SCRIPT_CLAIM_NAMESPACE) configDoc.claimNamespace = process.env.SCRIPT_CLAIM_NAMESPACE;
    else delete configDoc.claimNamespace;

    if (groupMappings.length > 0) configDoc.groupMappings = groupMappings;
    else delete configDoc.groupMappings;

    const ufm = {};
    if (process.env.SCRIPT_UFM_EXTERNAL_USER_ID) ufm.externalUserId = process.env.SCRIPT_UFM_EXTERNAL_USER_ID;
    if (process.env.SCRIPT_UFM_EMAIL)            ufm.email           = process.env.SCRIPT_UFM_EMAIL;
    if (process.env.SCRIPT_UFM_NAME)             ufm.name            = process.env.SCRIPT_UFM_NAME;
    if (Object.keys(ufm).length > 0) configDoc.userFieldMappings = ufm;
    else delete configDoc.userFieldMappings;

    process.stdout.write(JSON.stringify({ provider: providerDoc, config: configDoc }));
  } catch(e) { console.error('Failed to build payloads: ' + e.message); process.exit(1); }
});
")

  if [ $? -ne 0 ]; then
    echo ""; echo "Error building payloads. Aborting."; echo "$payloads"; exit 1
  fi

  provider_payload=$(echo "$payloads" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(JSON.stringify(JSON.parse(b).provider)); });
  ")
  provider_config_payload=$(echo "$payloads" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(JSON.stringify(JSON.parse(b).config)); });
  ")

  echo ""
  echo "Updated AuthProvider payload:"
  if command -v jq &> /dev/null; then echo "$provider_payload" | jq .
  else echo "$provider_payload"; fi
  echo ""
  echo "Updated AuthProviderConfig payload:"
  if command -v jq &> /dev/null; then echo "$provider_config_payload" | jq .
  else echo "$provider_config_payload"; fi
  echo ""

  read -p "Proceed with update in CouchDB? (y/n): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then echo "Aborted."; exit 0; fi

  provider_id=$(echo "$provider_payload" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(JSON.parse(b)._id); });
  ")
  provider_config_id=$(echo "$provider_config_payload" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(JSON.parse(b)._id); });
  ")

  provider_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/$provider_id" \
    -H "Content-Type: application/json" -d "$provider_payload")
  echo ""; echo "AuthProvider response from CouchDB:"
  if command -v jq &> /dev/null; then echo "$provider_response" | jq .
  else echo "$provider_response"; fi

  provider_config_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/$provider_config_id" \
    -H "Content-Type: application/json" -d "$provider_config_payload")
  echo ""; echo "AuthProviderConfig response from CouchDB:"
  if command -v jq &> /dev/null; then echo "$provider_config_response" | jq .
  else echo "$provider_config_response"; fi

  apply_group_acl_updates "$provider_member_of_json" "$original_member_of_json"
fi

# ── Default Groups (DefaultPermissions) ──────────────────────────────────────

if [ "$do_groups" = true ]; then
  echo ""
  echo "====================================="
  echo "   Configure Default Groups"
  echo "====================================="
  echo ""
  echo "Default groups are automatically assigned to ALL users (including guests)."
  echo "They are stored in a DefaultPermissions document in CouchDB."
  echo ""
  echo "Enter default group IDs, one per line. Leave blank and press Enter to finish."
  echo "Example: group-public-users"
  echo ""

  default_groups=()
  while true; do
    read -p "  Group ID (or blank to finish): " group_id
    if [ -z "$group_id" ]; then break; fi
    default_groups+=("$group_id")
  done

  if [ ${#default_groups[@]} -eq 0 ]; then
    echo "No default groups entered. Skipping DefaultPermissions setup."
    exit 0
  fi

  echo ""
  echo "Default groups to set: ${default_groups[*]}"
  echo ""

  groups_json=$(printf '%s\n' "${default_groups[@]}" | node -e "
    const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
    process.stdout.write(JSON.stringify(lines));
  ")

  existing_dp=$(curl -s -X GET "$DB_CONNECTION_STRING/$DB_DATABASE/global-config")

  existing_dp_rev=$(echo "$existing_dp" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{
      try { process.stdout.write(JSON.parse(b)._rev||''); } catch(e) { process.stdout.write(''); }
    });
  ")

  now_ms=$(node -e "process.stdout.write(String(Date.now()))")

  if [ -n "$existing_dp_rev" ]; then
    echo "Existing DefaultPermissions document found (rev: $existing_dp_rev)."
    read -p "Overwrite defaultGroups? (y/n): " overwrite_confirm
    if [[ "$overwrite_confirm" != "y" && "$overwrite_confirm" != "Y" ]]; then
      echo "Skipping DefaultPermissions update."
      exit 0
    fi
    dp_payload="{\"_id\":\"global-config\",\"_rev\":\"$existing_dp_rev\",\"type\":\"defaultPermissions\",\"memberOf\":[\"group-super-admins\"],\"defaultGroups\":$groups_json,\"updatedTimeUtc\":$now_ms}"
  else
    echo "No existing DefaultPermissions document found. Creating a new one."
    dp_payload="{\"_id\":\"global-config\",\"type\":\"defaultPermissions\",\"memberOf\":[\"group-super-admins\"],\"defaultGroups\":$groups_json,\"updatedTimeUtc\":$now_ms}"
  fi

  dp_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/global-config" \
    -H "Content-Type: application/json" -d "$dp_payload")

  echo ""
  echo "DefaultPermissions response from CouchDB:"
  if command -v jq &> /dev/null; then echo "$dp_response" | jq .
  else echo "$dp_response"; fi
fi

# ── Repair ACL entries for existing Auth Provider ─────────────────────────────

if [ "$do_repair_acl" = true ]; then
  echo ""
  echo "====================================="
  echo "   Repair AuthProvider ACL Entries"
  echo "====================================="
  echo ""
  echo "This will add or update the authProvider ACL entry on each group"
  echo "in the provider's memberOf list."
  echo ""

  providers_json=$(curl -s -X POST "$DB_CONNECTION_STRING/$DB_DATABASE/_find" \
    -H "Content-Type: application/json" \
    -d '{"selector":{"type":"authProvider"},"limit":100}')

  provider_count=$(echo "$providers_json" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(String((JSON.parse(b).docs||[]).length)); });
  ")

  if [ "$provider_count" -eq 0 ]; then
    echo "No auth providers found. Use 'Add Auth Provider' to create one."
    exit 0
  fi

  echo "Existing auth providers:"
  echo "$providers_json" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{
      JSON.parse(b).docs.forEach((p,i)=>{
        const tag = p.label ? p.label + ' — ' : '';
        const mo = (p.memberOf||[]).join(', ') || '(none)';
        console.log('  '+(i+1)+') '+tag+p.domain+' ('+p._id+')');
        console.log('       memberOf: '+mo);
      });
    });
  "
  echo ""
  read -p "Select provider to repair [1-$provider_count]: " provider_choice

  if ! [[ "$provider_choice" =~ ^[0-9]+$ ]] || \
     [ "$provider_choice" -lt 1 ] || [ "$provider_choice" -gt "$provider_count" ]; then
    echo "Invalid selection. Exiting."; exit 1
  fi

  repair_provider=$(echo "$providers_json" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{
      const docs=JSON.parse(b).docs;
      process.stdout.write(JSON.stringify(docs[$(( provider_choice - 1 ))]));
    });
  ")

  repair_member_of_json=$(echo "$repair_provider" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{ process.stdout.write(JSON.stringify(JSON.parse(b).memberOf||[])); });
  ")

  if [ "$repair_member_of_json" = "[]" ]; then
    echo "This provider has no memberOf groups — nothing to repair."
    exit 0
  fi

  echo ""
  echo "Will apply authProvider ACL entries to: $repair_member_of_json"
  read -p "Proceed? (y/n): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then echo "Aborted."; exit 0; fi

  apply_group_acl_updates "$repair_member_of_json"
fi
