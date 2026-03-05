#!/usr/bin/env bash
# Luminary setup: grant user groups, setup OAuth providers. Uses curl + jq. Run from repo root; API can stay running.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_ENV="$REPO_ROOT/api/.env"

# Load .env from api/ or cwd
load_env() {
    for f in "$API_ENV" "$REPO_ROOT/.env" ".env"; do
        [[ -r "$f" ]] && while IFS= read -r line; do
            [[ "$line" =~ ^#.*$ ]] && continue
            if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
                key="${BASH_REMATCH[1]}"
                val="${BASH_REMATCH[2]}"
                val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
                export "$key=$val"
            fi
        done < "$f" && break
    done
}
load_env

command -v jq >/dev/null 2>&1 || { echo "jq is required. Install with: brew install jq"; exit 1; }

DEFAULT_DB="${DB_DATABASE:-luminary-local}"
VIEW_NAME="view-user-email-userId"
PROVIDER_PUBLIC_GROUP="group-public-content"

prompt() { read -r -p "$1" reply; echo "$reply"; }

# CouchDB base URL and auth for curl. Uses DB_CONNECTION_STRING or prompts.
get_couch_opts() {
    if [[ -n "$DB_CONNECTION_STRING" ]]; then
        echo "Using DB_CONNECTION_STRING and DB_DATABASE from environment."
        COUCH_URL="$DB_CONNECTION_STRING"
        COUCH_DB="${DB_DATABASE:-$DEFAULT_DB}"
        return
    fi
    local base
    base=$(prompt "CouchDB URL (e.g. http://127.0.0.1:5984): ")
    base=${base:-http://127.0.0.1:5984}
    local user pass
    user=$(prompt "CouchDB Username: ")
    pass=$(prompt "CouchDB Password: ")
    COUCH_DB=$(prompt "CouchDB Database (default $DEFAULT_DB): ")
    COUCH_DB=${COUCH_DB:-$DEFAULT_DB}
    if [[ -n "$user" || -n "$pass" ]]; then
        local host="${base#*://}"
        COUCH_URL="${base%%://*}://${user}:${pass}@${host}"
    else
        COUCH_URL="$base"
    fi
}

couch_get() {
    curl -sS -f -X GET "${COUCH_URL}/${COUCH_DB}/${1}"
}

couch_put() {
    curl -sS -f -X PUT -H "Content-Type: application/json" -d "$2" "${COUCH_URL}/${COUCH_DB}/${1}"
}

couch_view() {
    curl -sS -f -X POST -H "Content-Type: application/json" \
        -d "{\"keys\":[\"$1\"]}" \
        "${COUCH_URL}/${COUCH_DB}/_design/${VIEW_NAME}/_view/${VIEW_NAME}?include_docs=true"
}

# --- Menu 1: Grant groups to user by email ---
grant_groups() {
    local group_input email confirm
    group_input=$(prompt "Group ID(s) to add to user, comma-separated: ")
    group_input=$(echo "$group_input" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | tr '\n' ',' | sed 's/,$//')
    [[ -z "$group_input" ]] && { echo "At least one group ID is required."; exit 1; }
    email=$(prompt "Email: ")
    [[ -z "$email" ]] && { echo "Email is required."; exit 1; }
    confirm=$(prompt "Grant access ($group_input) to $email? (Y/N): ")
    [[ ! "$confirm" =~ ^[Yy] ]] && [[ ! "$confirm" =~ ^[Yy]es$ ]] && { echo "Skipped."; return; }

    local res doc id rev new_member_of payload
    res=$(couch_view "$email") || { echo "View request failed."; exit 1; }
    doc=$(echo "$res" | jq -c '.rows[0].doc // empty')
    [[ -z "$doc" || "$doc" == "null" ]] && { echo "No user found for email: $email"; exit 1; }
    id=$(echo "$doc" | jq -r '._id')
    rev=$(echo "$doc" | jq -r '._rev')
    new_member_of=$(echo "$doc" | jq -c --arg gs "$group_input" '
        (.memberOf // []) as $m |
        ($gs | split(",") | map(gsub("^ *";"") | gsub(" *$";"")) | map(select(length>0))) as $add |
        ($m + $add) | unique
    ')
    payload=$(echo "$doc" | jq -c --argjson m "$new_member_of" '.memberOf = $m | .updatedTimeUtc = (now * 1000 | floor)')
    couch_put "$id" "$(echo "$payload" | jq -c --arg r "$rev" '. + {_rev:$r}')"
    echo "Access granted to $email."
}

# --- Menu 2/3: Setup auth providers ---
setup_providers() {
    local domain client_id audience label claim_ns
    claim_ns=$(prompt "Claim namespace (optional): ")
    local uf_user uf_email uf_name
    uf_user=$(prompt "  User field for userId inside namespace (optional): ")
    uf_email=$(prompt "  User field for email inside namespace (optional): ")
    uf_name=$(prompt "  User field for name inside namespace (optional): ")
    local claim_mapping
    claim_mapping=$(prompt "Claim names that map to groups, comma-separated: ")
    local default_groups
    default_groups=$(prompt "Group ID(s) to assign when users log in with this provider (comma-separated): ")
    default_groups=$(echo "$default_groups" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | tr '\n' ',' | sed 's/,$//')
    local provider_visibility
    provider_visibility=$(prompt "Group ID(s) for provider visibility, comma-separated (always includes $PROVIDER_PUBLIC_GROUP): ")
    local guest_group
    guest_group=$(prompt "Group ID to assign to guest users (optional): ")

    domain=$(prompt "Auth Domain (e.g. tenant.auth0.com): ")
    client_id=$(prompt "Auth Client ID: ")
    audience=$(prompt "Auth Audience: ")
    label=$(prompt "Provider label (optional, default: Default Provider): ")
    label=${label:-Default Provider}
    [[ -z "$domain" || -z "$client_id" || -z "$audience" ]] && { echo "Domain, Client ID, and Audience are required."; exit 1; }

    local member_of_arr
    member_of_arr=$(echo "$provider_visibility" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | jq -R -s -c 'split("\n") | map(select(length>0)) | . + ["'"$PROVIDER_PUBLIC_GROUP"'"] | unique')
    [[ "$member_of_arr" == "null" || -z "$member_of_arr" ]] && member_of_arr="[\"$PROVIDER_PUBLIC_GROUP\"]"

    local default_doc
    default_doc=$(jq -n -c \
        --arg domain "$(echo "$domain" | tr '[:upper:]' '[:lower:]')" \
        --arg client_id "$client_id" \
        --arg audience "$audience" \
        --arg label "$label" \
        --argjson member_of "$member_of_arr" \
        '{_id:"oAuthProvider-default",type:"oAuthProvider",label:$label,providerType:"auth0",domain:$domain,clientId:$client_id,audience:$audience,memberOf:$member_of,updatedTimeUtc:(now*1000|floor)}')
    [[ -n "$claim_ns" ]] && default_doc=$(echo "$default_doc" | jq -c --arg ns "$claim_ns" '. + {claimNamespace:$ns}')
    if [[ -n "$uf_user" || -n "$uf_email" || -n "$uf_name" ]]; then
        default_doc=$(echo "$default_doc" | jq -c --arg u "$uf_user" --arg e "$uf_email" --arg n "$uf_name" '. + {userFieldMappings:{userId:(if $u=="" then null else $u end),email:(if $e=="" then null else $e end),name:(if $n=="" then null else $n end)}}')
    fi
    if [[ -n "$default_groups" ]]; then
        local ga
        ga=$(echo "$default_groups" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | jq -R -s -c 'split("\n") | map(select(length>0)) | map({groupId:.,conditions:[{type:"authenticated"}]})')
        default_doc=$(echo "$default_doc" | jq -c --argjson ga "$ga" '. + {groupAssignments:$ga}')
    fi

    local existing
    existing=$(couch_get "oAuthProvider-default" 2>/dev/null || true)
    if [[ -n "$existing" ]] && echo "$existing" | jq -e '._rev' >/dev/null 2>&1; then
        default_doc=$(echo "$default_doc" | jq -c --arg rev "$(echo "$existing" | jq -r '._rev')" '. + {_rev:$rev}')
    fi
    couch_put "oAuthProvider-default" "$default_doc"
    echo "Default OAuth provider updated (domain: $domain)."

    local guest_doc
    guest_doc=$(jq -n -c --argjson member_of "$member_of_arr" \
        '{_id:"oAuthProvider-guest",type:"oAuthProvider",label:"Guest",providerType:"auth0",isGuestProvider:true,memberOf:$member_of,updatedTimeUtc:(now*1000|floor)}')
    if [[ -n "$guest_group" ]]; then
        guest_doc=$(echo "$guest_doc" | jq -c --arg g "$guest_group" '. + {groupAssignments:[{groupId:$g,conditions:[{type:"always"}]}]}')
    fi
    existing=$(couch_get "oAuthProvider-guest" 2>/dev/null || true)
    if [[ -n "$existing" ]] && echo "$existing" | jq -e '._rev' >/dev/null 2>&1; then
        guest_doc=$(echo "$guest_doc" | jq -c --arg rev "$(echo "$existing" | jq -r '._rev')" '. + {_rev:$rev}')
    fi
    couch_put "oAuthProvider-guest" "$guest_doc"
    echo "Guest OAuth provider updated."
}

# --- Main ---
echo ""
echo "Setup (Luminary)"
echo "1. Give super-admin access to initial user (by email)"
echo "2. Setup initial auth provider + guest auth provider"
echo "3. Setup auth providers and initial super-admin user"
echo ""
choice=$(prompt "Choice (1/2/3): ")
[[ "$choice" != "1" && "$choice" != "2" && "$choice" != "3" ]] && { echo "Invalid choice."; exit 1; }

get_couch_opts

if [[ "$choice" == "2" || "$choice" == "3" ]]; then
    setup_providers
fi
if [[ "$choice" == "1" || "$choice" == "3" ]]; then
    grant_groups
fi
echo "Done."
