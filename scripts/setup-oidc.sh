#!/usr/bin/env bash
# Configure GitHub Actions -> Azure federated (OIDC) authentication using a
# USER-ASSIGNED MANAGED IDENTITY.
#
# Advantages over the app-registration approach:
#   - The identity is an Azure resource, so it lives/dies with the resource group
#     and is managed via ARM RBAC rather than Entra directory permissions.
#   - No Application Administrator / directory write privileges required.
#   - It can additionally be attached to Azure resources (ACR pull, Key Vault, ...).
#
# Creates the deployment identity and its GitHub Environment federation. The
# identity receives deployment and scoped role-assignment permissions on the
# resource group so Bicep can grant ACR pull/push roles.
#
# Prereqs: az login, and (optionally) gh auth login with a token that can write
# Actions secrets. If the gh write fails the values are printed for manual entry.
#
# Usage:
#   ./scripts/setup-oidc.sh -g <resource-group> -l <location> [-r <owner/repo>] [-e <gh-environment>] [-n <identity-name>]

set -euo pipefail

RESOURCE_GROUP=""
LOCATION=""
REPO=""
BRANCH="main"
GH_ENVIRONMENT="demo"
IDENTITY_NAME=""
ROLE="Contributor"

while getopts "g:l:r:b:e:n:R:h" opt; do
  case "$opt" in
    g) RESOURCE_GROUP="$OPTARG" ;;
    l) LOCATION="$OPTARG" ;;
    r) REPO="$OPTARG" ;;
    b) BRANCH="$OPTARG" ;;
    e) GH_ENVIRONMENT="$OPTARG" ;;
    n) IDENTITY_NAME="$OPTARG" ;;
    R) ROLE="$OPTARG" ;;
    h) sed -n '2,19p' "$0"; exit 0 ;;
    *) exit 1 ;;
  esac
done

command -v az >/dev/null || { echo "az CLI not found" >&2; exit 1; }
command -v gh >/dev/null || { echo "gh CLI not found" >&2; exit 1; }

az account show >/dev/null 2>&1 || { echo "Run 'az login' first." >&2; exit 1; }

if [[ -z "$RESOURCE_GROUP" || -z "$LOCATION" ]]; then
  echo "Both -g <resource-group> and -l <location> are required." >&2
  exit 1
fi

if [[ -z "$REPO" ]]; then
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
fi

PLAIN_REPO_SUBJECT_PREFIX="repo:$REPO"
EMU_REPO_SUBJECT_PREFIX=""
if repo_subject_parts=$(gh api "repos/$REPO" --jq '[.owner.login, .owner.id, .name, .id] | @tsv'); then
  read -r REPO_OWNER REPO_OWNER_ID REPO_NAME REPO_ID <<<"$repo_subject_parts"
  if [[ -n "$REPO_OWNER" && -n "$REPO_OWNER_ID" && -n "$REPO_NAME" && -n "$REPO_ID" ]]; then
    EMU_REPO_SUBJECT_PREFIX="repo:${REPO_OWNER}@${REPO_OWNER_ID}/${REPO_NAME}@${REPO_ID}"
  fi
else
  echo "Could not read GitHub repository ids; continuing with the standard GitHub OIDC subject."
fi

# Managed identity names allow only alphanumerics, hyphens and underscores.
[[ -n "$IDENTITY_NAME" ]] || IDENTITY_NAME="id-gh-oidc-$(echo "${REPO//\//-}" | tr -cd '[:alnum:]-_')"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "Repo:           $REPO"
echo "Subscription:   $SUBSCRIPTION_ID"
echo "Tenant:         $TENANT_ID"
echo "Resource group: $RESOURCE_GROUP ($LOCATION)"
echo "Identity:       $IDENTITY_NAME (user-assigned managed identity)"
echo "Deployment role: $ROLE"
echo "Role assignment: User Access Administrator (resource group scope)"
echo "GitHub environment: ${GH_ENVIRONMENT:-branch $BRANCH}"
echo

# --- 1. Resource group -------------------------------------------------------
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" -o none
echo "✓ resource group ready"

# --- 2. User-assigned managed identity ---------------------------------------
if az identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "✓ reusing existing managed identity"
else
  az identity create \
    --name "$IDENTITY_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    -o none
  echo "✓ created managed identity"
fi

read -r CLIENT_ID PRINCIPAL_ID IDENTITY_RESOURCE_ID <<<"$(az identity show \
  --name "$IDENTITY_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[clientId, principalId, id]" -o tsv | paste -s)"

# --- 3. Role assignment (scoped to the resource group) -----------------------
SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"
ensure_role_assignment() {
  local role="$1"
  local assignment_count
  assignment_count=$(az role assignment list \
    --all \
    --assignee-object-id "$PRINCIPAL_ID" \
    --fill-principal-name false \
    --scope "$SCOPE" \
    --query "[?roleDefinitionName=='$role'] | length(@)" \
    -o tsv)
  if [[ "$assignment_count" == "0" ]]; then
    az role assignment create \
      --assignee-object-id "$PRINCIPAL_ID" \
      --assignee-principal-type ServicePrincipal \
      --role "$role" \
      --scope "$SCOPE" \
      -o none
  fi

  assignment_count=$(az role assignment list \
    --all \
    --assignee-object-id "$PRINCIPAL_ID" \
    --fill-principal-name false \
    --scope "$SCOPE" \
    --query "[?roleDefinitionName=='$role'] | length(@)" \
    -o tsv)
  [[ "$assignment_count" != "0" ]] || {
    echo "Role assignment '$role' was not found on $SCOPE after creation." >&2
    return 1
  }
  echo "✓ $role granted on $SCOPE"
}

ensure_role_assignment "$ROLE"
ensure_role_assignment "User Access Administrator"

# --- 4. Federated credentials ------------------------------------------------
add_federated_credential() {
  local name="$1" subject="$2"
  if [[ "$(az identity federated-credential list \
             --identity-name "$IDENTITY_NAME" \
             --resource-group "$RESOURCE_GROUP" \
             --query "[?subject=='$subject'] | length(@)" -o tsv)" != "0" ]]; then
    echo "  · federated credential already exists: $subject"
    return
  fi
  az identity federated-credential create \
    --name "$name" \
    --identity-name "$IDENTITY_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --issuer "https://token.actions.githubusercontent.com" \
    --subject "$subject" \
    --audiences "api://AzureADTokenExchange" \
    -o none
  echo "  · added federated credential: $subject"
}

if [[ -n "$GH_ENVIRONMENT" ]]; then
  ENVIRONMENT_CREDENTIAL_NAME=$(printf '%s' "$GH_ENVIRONMENT" | tr -cd '[:alnum:]-')
  [[ -n "$ENVIRONMENT_CREDENTIAL_NAME" ]] || {
    echo "GitHub Environment name must contain at least one alphanumeric character." >&2
    exit 1
  }
  add_federated_credential "gh-env-${ENVIRONMENT_CREDENTIAL_NAME}" "$PLAIN_REPO_SUBJECT_PREFIX:environment:$GH_ENVIRONMENT"
else
  add_federated_credential "gh-branch-$BRANCH" "$PLAIN_REPO_SUBJECT_PREFIX:ref:refs/heads/$BRANCH"
fi
if [[ -n "$EMU_REPO_SUBJECT_PREFIX" ]]; then
  if [[ -n "$GH_ENVIRONMENT" ]]; then
    add_federated_credential "gh-emu-env-${ENVIRONMENT_CREDENTIAL_NAME}" "$EMU_REPO_SUBJECT_PREFIX:environment:$GH_ENVIRONMENT"
  else
    add_federated_credential "gh-emu-branch-$BRANCH" "$EMU_REPO_SUBJECT_PREFIX:ref:refs/heads/$BRANCH"
  fi
fi
echo "✓ federated credentials configured"

# --- 5. GitHub secrets + variables ------------------------------------------
# The default Codespaces GITHUB_TOKEN cannot write Actions secrets (403), so fall
# back to printing the values instead of failing after the Azure side is done.
gh_write_ok=1
push_secret()   { gh secret   set "$1" --repo "$REPO" --body "$2" 2>/dev/null || gh_write_ok=0; }
push_variable() { gh variable set "$1" --repo "$REPO" --body "$2" 2>/dev/null || gh_write_ok=0; }

push_secret AZURE_CLIENT_ID       "$CLIENT_ID"
push_secret AZURE_TENANT_ID       "$TENANT_ID"
push_secret AZURE_SUBSCRIPTION_ID "$SUBSCRIPTION_ID"
push_variable AZURE_RESOURCE_GROUP    "$RESOURCE_GROUP"
push_variable AZURE_LOCATION          "$LOCATION"
push_variable AZURE_IDENTITY_RESOURCE_ID "$IDENTITY_RESOURCE_ID"
push_variable AZURE_DEPLOYER_PRINCIPAL_ID "$PRINCIPAL_ID"
push_variable AZURE_GITHUB_ENVIRONMENT "$GH_ENVIRONMENT"

echo
if [[ "$gh_write_ok" == "1" ]]; then
  echo "✓ GitHub secrets and variables set"
  echo "Done. AZURE_CLIENT_ID=$CLIENT_ID"
  echo "Verify with: gh workflow run deploy.yml --repo $REPO"
else
  cat <<EOF
! Could not write GitHub secrets/variables with the current token.
  The Azure side is fully configured. Re-run after 'gh auth login' with a PAT
  that has the 'repo' scope, or add these manually at
  https://github.com/$REPO/settings/secrets/actions

  Secrets:
    AZURE_CLIENT_ID        $CLIENT_ID
    AZURE_TENANT_ID        $TENANT_ID
    AZURE_SUBSCRIPTION_ID  $SUBSCRIPTION_ID

  Variables (https://github.com/$REPO/settings/variables/actions):
    AZURE_RESOURCE_GROUP        $RESOURCE_GROUP
    AZURE_LOCATION              $LOCATION
    AZURE_IDENTITY_RESOURCE_ID  $IDENTITY_RESOURCE_ID
    AZURE_DEPLOYER_PRINCIPAL_ID $PRINCIPAL_ID
    AZURE_GITHUB_ENVIRONMENT    $GH_ENVIRONMENT
EOF
fi

cat <<EOF

The deployment identity needs Contributor and User Access Administrator on the
resource group. The Bicep deployment grants AcrPush to this identity and AcrPull
to the runtime identities on the registry.
EOF
