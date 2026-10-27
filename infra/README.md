# Azure Container Apps reference deployment

This directory and `.github/workflows/deploy.yml` provide the repository's
reference deployment path for Challenge 5. The challenge is still optional, and
participants can adapt or replace this implementation; these files are no longer
an unfinished scaffold.

This is a disposable demo, not a production deployment. It uses a single C# API
replica and a local SQLite database. Container replacement or a new API revision
can erase demo data. The application uses SQLite WAL mode; Azure Files is not a
drop-in persistence solution for this topology.

## Topology

```text
Public HTTPS
    │
    ▼
Frontend Container App (nginx, port 80, 1–3 replicas)
    │  /api/* → API Container Apps ingress (HTTPS/443)
    ▼
Internal C# API Container App (port 3000, exactly 1 replica)
    │
    └── Local disposable SQLite file (/tmp/octosupply/app.db)

ACR (admin account disabled) ◄── managed identity pulls
Log Analytics ◄── Container Apps environment logs
```

The browser calls `/api/...` on the frontend origin. nginx forwards those
requests to the API's internal Container Apps FQDN over HTTPS ingress; browser
configuration never includes the API hostname or container target port.
`GET /health/live` checks only that the API process responds.
`GET /health/ready` returns 200 only after initialization and a successful query
against the SQLite application schema; otherwise it returns 503.

## Prerequisites and bootstrap

- An Azure subscription with Container Apps capacity and quota in the selected
  region. Register the required providers before deployment:

  ```bash
  az provider register --namespace Microsoft.App
  az provider register --namespace Microsoft.OperationalInsights
  az provider register --namespace Microsoft.ContainerRegistry
  az provider register --namespace Microsoft.ManagedIdentity
  ```

- Azure CLI, GitHub CLI, and `az login`; use a region with Container Apps and ACR
  capacity.
- Permission to create the resource group, user-assigned managed identity, and
  federated credentials, and to create role assignments at the resource-group
  scope. GitHub CLI must be authorized to write repository Actions secrets and
  variables.
- Configure the GitHub Environment used for deployment (default `demo`) and add
  required reviewers and limit deployment branches to `main` under
  **Repository Settings → Environments**. The bootstrap helper selects the
  environment but does not configure its protection rules. The workflow deploys
  only from that environment and has no pull-request deployment trigger.

Bootstrap the identity and the resource group once:

```bash
./scripts/setup-oidc.sh \
  -g octocat-demo-rg \
  -l eastus \
  -r NowinskiK/microhack-sdlc \
  -e demo
```

The short options are also supported (`-g`, `-l`, `-r`, `-e`). The helper is
idempotent: it reuses an existing resource group/identity, checks role
assignments and federation subjects before creating them, and fails if required
Azure role assignments cannot be established. It creates the `demo` GitHub
Environment federation subject (`repo:<owner>/<repo>:environment:demo`) and
does not grant deployment trust to pull requests.

The bootstrap user needs the Azure permissions above. The deployment identity
receives **Contributor** and **User Access Administrator** scoped to the target
resource group. Contributor provisions resources; the scoped role-assignment
authority is needed because Bicep assigns `AcrPush` to the deploy identity and
`AcrPull` to the two runtime identities on the new registry. The helper writes
the identity client ID, tenant/subscription IDs, resource group, region,
environment name, and deployer principal ID to GitHub Actions secrets/variables.
If GitHub CLI cannot write them, add the reported values manually.

Required GitHub secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Required GitHub variables:

- `AZURE_RESOURCE_GROUP`
- `AZURE_LOCATION`
- `AZURE_DEPLOYER_PRINCIPAL_ID`
- `AZURE_GITHUB_ENVIRONMENT`

`infra/main.parameters.json` contains only non-secret naming defaults. The
workflow supplies the region, principal ID, stage, and immutable image tags at
deployment time. Resource names derive deterministically from the prefix and
environment; the ACR name includes a stable hash derived from the subscription
and resource-group IDs to make it globally unique.

## Deployment

Run **Actions → Deploy C# API and frontend → Run workflow**, or push to `main`.
The workflow is serialized per resource group and bound to the configured GitHub
Environment. It:

1. Installs locked frontend dependencies, builds and tests the C# API and React
   frontend, and compiles Bicep.
2. Uses GitHub OIDC to log in to Azure; no client secret or registry password
   is used.
3. Validates and previews the `foundation` Bicep stage, then provisions ACR,
   Log Analytics, the Container Apps environment, runtime identities, and ACR
   role assignments.
4. Builds and pushes the API and frontend images tagged with the commit SHA.
5. Validates and previews the `apps` stage, then deploys both Container Apps.
6. Waits a bounded time for the latest revisions and runs frontend, API proxy,
   seeded catalogue, order creation/history, and API error-status smoke tests.
   Any validation, readiness, or smoke-test failure fails the workflow.

The resource group is created by the bootstrap helper; the deployment workflow
requires it to exist and fails clearly if it does not. Re-running the workflow
reuses the same resources and deploys new immutable image tags. The Actions
summary contains the public frontend URL and image identifiers.

## Verification

After a successful run:

- Open the frontend URL from the workflow summary and browse `/products`,
  create an order, and view order history.
- The workflow checks the same flow through the public frontend origin, including
  that API errors retain their HTTP status and JSON response.
- Confirm the API app has internal ingress and a one-to-one minimum/maximum
  replica count. The frontend has public HTTPS ingress.
- Inspect each app's registry configuration and attached user-assigned identity.
  ACR admin access is disabled; the runtime identities have registry pull
  permission.
- The API liveness/readiness routes are intended for Container Apps probes and
  are not public because the API ingress is internal.

## Rollback

Images remain tagged by commit SHA. To redeploy a previous successful release,
use its API and frontend image identifiers from that workflow's summary:

```bash
az deployment group create \
  --name applications \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json \
    deploymentStage=apps \
    location="$AZURE_LOCATION" \
    deployerPrincipalId="$AZURE_DEPLOYER_PRINCIPAL_ID" \
    apiImage="<acr>.azurecr.io/api:<previous-commit-sha>" \
    frontendImage="<acr>.azurecr.io/frontend:<previous-commit-sha>"
```

This deploys new revisions using the prior images; it does **not** restore
SQLite data. Treat demo data as disposable before deploying or rolling back.

## Troubleshooting

- **OIDC login fails:** verify the workflow's selected GitHub Environment exactly
  matches the federated credential subject, and check the three OIDC secrets.
- **Bicep role assignment fails:** the deployment identity needs
  `User Access Administrator` at the resource-group scope in addition to
  `Contributor`. The bootstrap user also needs permission to create those
  assignments.
- **ACR login/pull fails:** confirm the deploy identity has `AcrPush` and both
  app identities have `AcrPull`; allow role-assignment propagation time.
- **API revision is not ready:** inspect API container logs and confirm the
  packaged migration and seed directories exist. Startup intentionally fails if
  migrations are unavailable or initialization fails.
- **Frontend returns 502 for `/api`:** verify the frontend's API host is the
  internal API ingress FQDN, API ingress uses HTTPS on port 443, and both apps
  are in the same Container Apps environment.
- **Provisioning fails:** check subscription provider registration, region
  capacity, quota, and role permissions before retrying.

## Costs and cleanup

The template uses Basic ACR, a 30-day Log Analytics workspace, and Consumption
Container Apps with 0.5 vCPU/1 GiB containers. Costs vary by region, uptime,
resource consumption, and log ingestion. Set an Azure budget and delete the demo
when finished:

```bash
az group delete --name "$AZURE_RESOURCE_GROUP" --yes --no-wait
```

Also remove the repository's OIDC secrets/variables and GitHub Environment if
they are no longer needed. This baseline does not provide durable storage,
backups, private networking, application authentication, or production
availability guarantees.
