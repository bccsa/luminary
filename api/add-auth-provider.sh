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

  # Execute Node.js script to process the data according to the new AuthProviderDto schema
  payload=$(cat << 'EOF' | node
try {
  let rawLegacyMappings = process.env.SCRIPT_LEGACY_MAPPINGS || "{}";
  let legacy = {};
  if (rawLegacyMappings.trim() !== "") {
    legacy = JSON.parse(rawLegacyMappings);
  }

  const result = {
      type: "authProvider",
      domain: process.env.SCRIPT_DOMAIN,
      audience: process.env.SCRIPT_AUDIENCE,
      clientId: process.env.SCRIPT_CLIENT_ID,
      groupMappings: [],
      userFieldMappings: {},
      updatedTimeUtc: Date.now()
  };

  let claimNamespace = null;

  if (legacy.groups) {
      for (const [groupId, funcStr] of Object.entries(legacy.groups)) {
          let conditionType = "always";
          if (typeof funcStr === "string" && funcStr.includes("(jwt)")) {
              conditionType = "authenticated";
          }
          result.groupMappings.push({
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
              result.userFieldMappings[key] = fieldMatch[1];
          } else {
              result.userFieldMappings[key] = key;
          }
      }
  }

  if (claimNamespace) {
      result.claimNamespace = claimNamespace;
  }

  result.memberOf = result.groupMappings.map(m => m.groupId);

  console.log(JSON.stringify(result));
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
    echo "$payload"
    exit 1
  fi

  echo ""
  echo "Generated Payload for Database:"
  if command -v jq &> /dev/null; then
    echo "$payload" | jq .
  else
    echo "$payload"
  fi
  echo ""

  read -p "Proceed with insertion into CouchDB? (y/n): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi

  # Insert into CouchDB via POST
  response=$(curl -s -X POST "$DB_CONNECTION_STRING/$DB_DATABASE" \
    -H "Content-Type: application/json" \
    -d "$payload")

  echo ""
  echo "Response from CouchDB:"
  if command -v jq &> /dev/null; then
    echo "$response" | jq .
  else
    echo "$response"
  fi
fi

# ── Default Groups (GlobalConfig) ────────────────────────────────────────────

if [ "$do_groups" = true ]; then
  echo ""
  echo "====================================="
  echo "   Configure Default Groups"
  echo "====================================="
  echo ""
  echo "Default groups are automatically assigned to ALL users (including guests)."
  echo "They are stored in a GlobalConfig document in CouchDB."
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
    echo "No default groups entered. Skipping GlobalConfig setup."
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

  # Check if a GlobalConfig document already exists
  existing_config=$(curl -s -X POST "$DB_CONNECTION_STRING/$DB_DATABASE/_find" \
    -H "Content-Type: application/json" \
    -d '{"selector":{"type":"globalConfig"},"limit":1}')

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
    echo "Existing GlobalConfig document found (id: $existing_id, rev: $existing_rev)."
    read -p "Overwrite defaultGroups? (y/n): " overwrite_confirm
    if [[ "$overwrite_confirm" != "y" && "$overwrite_confirm" != "Y" ]]; then
      echo "Skipping GlobalConfig update."
      exit 0
    fi
    now_ms=$(node -e "process.stdout.write(String(Date.now()))")
  config_payload="{\"_id\":\"$existing_id\",\"_rev\":\"$existing_rev\",\"type\":\"globalConfig\",\"defaultGroups\":$groups_json,\"updatedTimeUtc\":$now_ms}"
    config_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/$existing_id" \
      -H "Content-Type: application/json" \
      -d "$config_payload")
  else
    echo "No existing GlobalConfig document found. Creating a new one."
    now_ms=$(node -e "process.stdout.write(String(Date.now()))")
    config_payload="{\"_id\":\"global-config\",\"type\":\"globalConfig\",\"defaultGroups\":$groups_json,\"updatedTimeUtc\":$now_ms}"
    config_response=$(curl -s -X PUT "$DB_CONNECTION_STRING/$DB_DATABASE/global-config" \
      -H "Content-Type: application/json" \
      -d "$config_payload")
  fi

  echo ""
  echo "GlobalConfig response from CouchDB:"
  if command -v jq &> /dev/null; then
    echo "$config_response" | jq .
  else
    echo "$config_response"
  fi
fi
