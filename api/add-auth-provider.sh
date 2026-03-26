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

# ── Menu ─────────────────────────────────────────────────────────────────────

echo "====================================="
echo "   Luminary Auth Setup"
echo "====================================="
echo ""
echo "  1) Add Auth Provider"
echo "  2) Configure Default Groups"
echo "  3) Both"
echo ""
read -p "Select an option [1-3]: " menu_choice

case "$menu_choice" in
  1) do_provider=true;  do_groups=false ;;
  2) do_provider=false; do_groups=true  ;;
  3) do_provider=true;  do_groups=true  ;;
  *) echo "Invalid option. Exiting."; exit 1 ;;
esac

# ── Auth Provider ─────────────────────────────────────────────────────────────

if [ "$do_provider" = true ]; then
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

  echo ""
  echo "Enter Legacy JSON Mappings (single line):"
  echo "Example:"
  echo '{"groups":{"group-public-content":"(jwt) => true"},"userId":"(jwt) => jwt && jwt[\"https://luminary-dev.com/metadata\"].userId"}'
  read -r legacyMappings

  echo "Parsing input..."

  export SCRIPT_LEGACY_MAPPINGS="$legacyMappings"
  export SCRIPT_DOMAIN="$domain"
  export SCRIPT_AUDIENCE="$audience"
  export SCRIPT_CLIENT_ID="$clientId"

  # Execute Node.js script to produce separate AuthProvider and AuthProviderConfig payloads
  payloads=$(cat << 'EOF' | node
try {
  let rawLegacyMappings = process.env.SCRIPT_LEGACY_MAPPINGS || "{}";
  let legacy = {};
  if (rawLegacyMappings.trim() !== "") {
    legacy = JSON.parse(rawLegacyMappings);
  }

  const { randomUUID } = require("crypto");
  const providerId = randomUUID();
  const now = Date.now();

  const groupMappings = [];
  let claimNamespace = null;
  const userFieldMappings = {};

  if (legacy.groups) {
      for (const [groupId, funcStr] of Object.entries(legacy.groups)) {
          let conditionType = "always";
          if (typeof funcStr === "string" && funcStr.includes("(jwt)")) {
              conditionType = "authenticated";
          }
          groupMappings.push({
              groupId: groupId,
              conditions: [{ type: conditionType }]
          });
      }
  }

  for (const [key, value] of Object.entries(legacy)) {
      if (key === "groups") continue;

      if (typeof value === "string") {
          const nsMatch = value.match(/jwt\[['"\\]+([^'"\\]+)['"\\]+\]/);
          if (nsMatch && nsMatch[1] && !claimNamespace) {
              claimNamespace = nsMatch[1];
          }

          const fieldMatch = value.match(/\.([a-zA-Z0-9_]+)$/);
          if (fieldMatch && fieldMatch[1]) {
              userFieldMappings[key] = fieldMatch[1];
          } else {
              userFieldMappings[key] = key;
          }
      }
  }

  const memberOf = groupMappings.map(m => m.groupId);

  // AuthProvider doc — public-facing fields only
  const providerDoc = {
      _id: providerId,
      type: "authProvider",
      domain: process.env.SCRIPT_DOMAIN,
      audience: process.env.SCRIPT_AUDIENCE,
      clientId: process.env.SCRIPT_CLIENT_ID,
      memberOf: memberOf,
      updatedTimeUtc: now
  };

  // AuthProviderConfig doc — sensitive server-side config
  const configDoc = {
      _id: randomUUID(),
      type: "authProviderConfig",
      providerId: providerId,
      memberOf: memberOf,
      updatedTimeUtc: now
  };
  if (claimNamespace) configDoc.claimNamespace = claimNamespace;
  if (groupMappings.length > 0) configDoc.groupMappings = groupMappings;
  if (Object.keys(userFieldMappings).length > 0) configDoc.userFieldMappings = userFieldMappings;

  console.log(JSON.stringify({ provider: providerDoc, config: configDoc }));
} catch (e) {
  console.error("JSON parsing failed: " + e.message);
  process.exit(1);
}
EOF
)

  if [ $? -ne 0 ]; then
    echo ""
    echo "Error during mapping parse. Aborting."
    echo "Parser Output:"
    echo "$payloads"
    exit 1
  fi

  provider_payload=$(echo "$payloads" | node -e "
    let body = '';
    process.stdin.on('data', d => body += d);
    process.stdin.on('end', () => {
      const parsed = JSON.parse(body);
      process.stdout.write(JSON.stringify(parsed.provider));
    });
  ")

  config_payload=$(echo "$payloads" | node -e "
    let body = '';
    process.stdin.on('data', d => body += d);
    process.stdin.on('end', () => {
      const parsed = JSON.parse(body);
      process.stdout.write(JSON.stringify(parsed.config));
    });
  ")

  echo ""
  echo "Generated AuthProvider payload:"
  if command -v jq &> /dev/null; then
    echo "$provider_payload" | jq .
  else
    echo "$provider_payload"
  fi
  echo ""
  echo "Generated AuthProviderConfig payload:"
  if command -v jq &> /dev/null; then
    echo "$config_payload" | jq .
  else
    echo "$config_payload"
  fi
  echo ""

  read -p "Proceed with insertion into CouchDB? (y/n): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi

  # Extract provider _id for PUT
  provider_id=$(echo "$provider_payload" | node -e "
    let body = '';
    process.stdin.on('data', d => body += d);
    process.stdin.on('end', () => {
      const parsed = JSON.parse(body);
      process.stdout.write(parsed._id);
    });
  ")

  config_id=$(echo "$config_payload" | node -e "
    let body = '';
    process.stdin.on('data', d => body += d);
    process.stdin.on('end', () => {
      const parsed = JSON.parse(body);
      process.stdout.write(parsed._id);
    });
  ")

  # Insert AuthProvider doc
  provider_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/$provider_id" \
    -H "Content-Type: application/json" \
    -d "$provider_payload")

  echo ""
  echo "AuthProvider response from CouchDB:"
  if command -v jq &> /dev/null; then
    echo "$provider_response" | jq .
  else
    echo "$provider_response"
  fi

  # Insert AuthProviderConfig doc
  config_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/$config_id" \
    -H "Content-Type: application/json" \
    -d "$config_payload")

  echo ""
  echo "AuthProviderConfig response from CouchDB:"
  if command -v jq &> /dev/null; then
    echo "$config_response" | jq .
  else
    echo "$config_response"
  fi

  echo ""
  echo "NOTE: Ensure the relevant group documents have ACL entries granting public users"
  echo "      'view' access to DocType.AuthProvider (and super-admins full access)."
  echo "      The add-auth-provider script does not modify group ACL entries."

  # ── Backfill providerId on existing users ──────────────────────────────────

  echo ""
  read -p "Backfill providerId='$provider_id' onto all existing users? (y/n): " backfill_confirm
  if [[ "$backfill_confirm" == "y" || "$backfill_confirm" == "Y" ]]; then

    echo "Fetching all user documents..."

    # Fetch all user docs via _find (page through with bookmark if needed)
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
    const body = JSON.stringify({
      selector: { type: 'user' },
      limit: 200,
      ...(bookmark ? { bookmark } : {})
    });

    const fullUrl = \`\${base}/\${db}/_find\`;
    const parsed = url.parse(fullUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const result = await new Promise((resolve, reject) => {
      const req = lib.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        auth: parsed.auth || undefined
      }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    if (result.docs && result.docs.length > 0) {
      docs.push(...result.docs);
      bookmark = result.bookmark;
      if (result.docs.length < 200) break;
    } else {
      break;
    }
  }

  process.stdout.write(JSON.stringify(docs));
}

findAll().catch(e => { console.error(e.message); process.exit(1); });
" DB_CONNECTION_STRING="$DB_CONNECTION_STRING" DB_DATABASE="$DB_DATABASE")

    user_count=$(echo "$all_users_json" | node -e "
      let b=''; process.stdin.on('data',d=>b+=d);
      process.stdin.on('end',()=>{ const d=JSON.parse(b); process.stdout.write(String(d.length)); });
    ")

    echo "Found $user_count user(s)."

    if [ "$user_count" -eq 0 ]; then
      echo "No users to update."
    else
      echo "Updating users with providerId='$provider_id'..."

      result=$(echo "$all_users_json" | node -e "
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
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      auth: parsed.auth || undefined
    }, (r) => {
      let data = '';
      r.on('data', d => data += d);
      r.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  const errors = res.filter(r => r.error);
  process.stdout.write(JSON.stringify({ total: bulk.length, errors }));
});
" DB_CONNECTION_STRING="$DB_CONNECTION_STRING" DB_DATABASE="$DB_DATABASE" PROVIDER_ID="$provider_id")

      error_count=$(echo "$result" | node -e "
        let b=''; process.stdin.on('data',d=>b+=d);
        process.stdin.on('end',()=>{ const d=JSON.parse(b); process.stdout.write(String(d.errors.length)); });
      ")

      if [ "$error_count" -eq 0 ]; then
        echo "Successfully updated $user_count user(s)."
      else
        echo "Completed with $error_count error(s):"
        echo "$result" | node -e "
          let b=''; process.stdin.on('data',d=>b+=d);
          process.stdin.on('end',()=>{ const d=JSON.parse(b); d.errors.forEach(e=>console.log(JSON.stringify(e))); });
        "
      fi
    fi
  fi
fi

# ── Default Groups (DefaultPermissions) ────────────────────────────────────────────

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
    if [ -z "$group_id" ]; then
      break
    fi
    default_groups+=("$group_id")
  done

  if [ ${#default_groups[@]} -eq 0 ]; then
    echo "No default groups entered. Skipping DefaultPermissions setup."
    exit 0
  fi

  echo ""
  echo "Default groups to set: ${default_groups[*]}"
  echo ""

  # Build JSON array of group IDs
  groups_json=$(printf '%s\n' "${default_groups[@]}" | node -e "
    const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n').filter(Boolean);
    process.stdout.write(JSON.stringify(lines));
  ")

  # Check if a DefaultPermissions document already exists
  existing_config=$(curl -s -X POST "$DB_CONNECTION_STRING/$DB_DATABASE/_find" \
    -H "Content-Type: application/json" \
    -d '{"selector":{"type":"defaultPermissions"},"limit":1}')

  existing_id=$(echo "$existing_config" | node -e "
    let body = '';
    process.stdin.on('data', d => body += d);
    process.stdin.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const doc = parsed.docs && parsed.docs[0];
        process.stdout.write(doc ? doc._id : '');
      } catch(e) { process.stdout.write(''); }
    });
  ")

  existing_rev=$(echo "$existing_config" | node -e "
    let body = '';
    process.stdin.on('data', d => body += d);
    process.stdin.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const doc = parsed.docs && parsed.docs[0];
        process.stdout.write(doc ? doc._rev : '');
      } catch(e) { process.stdout.write(''); }
    });
  ")

  if [ -n "$existing_id" ]; then
    echo "Existing DefaultPermissions document found (id: $existing_id, rev: $existing_rev)."
    read -p "Overwrite defaultGroups? (y/n): " overwrite_confirm
    if [[ "$overwrite_confirm" != "y" && "$overwrite_confirm" != "Y" ]]; then
      echo "Skipping DefaultPermissions update."
      exit 0
    fi
    now_ms=$(node -e "process.stdout.write(String(Date.now()))")
    config_payload="{\"_id\":\"$existing_id\",\"_rev\":\"$existing_rev\",\"type\":\"defaultPermissions\",\"memberOf\":[\"group-super-admins\"],\"defaultGroups\":$groups_json,\"updatedTimeUtc\":$now_ms}"
    config_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/$existing_id" \
      -H "Content-Type: application/json" \
      -d "$config_payload")
  else
    echo "No existing DefaultPermissions document found. Creating a new one."
    now_ms=$(node -e "process.stdout.write(String(Date.now()))")
    config_payload="{\"_id\":\"default-permissions\",\"type\":\"defaultPermissions\",\"memberOf\":[\"group-super-admins\"],\"defaultGroups\":$groups_json,\"updatedTimeUtc\":$now_ms}"
    config_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/default-permissions" \
      -H "Content-Type: application/json" \
      -d "$config_payload")
  fi

  echo ""
  echo "DefaultPermissions response from CouchDB:"
  if command -v jq &> /dev/null; then
    echo "$config_response" | jq .
  else
    echo "$config_response"
  fi
fi
