# Walkthrough Challenge 5 - Deploy into Azure

**[Home](../../Readme.md)** - [Previous Challenge Solution](../challenge-04/solution-04.md) - [Next Challenge Solution](../challenge-06/solution-06.md)

Duration: 60 minutes

## Reference implementation

This checkout includes a working reference deployment path for the C#/.NET 10
API and React frontend on Azure Container Apps. Challenge 5 remains optional:
participants may follow, inspect, adapt, or replace this implementation rather
than treating it as the only correct answer.

The reference topology uses a public HTTPS nginx frontend that proxies `/api/*`
to an internal API ingress. The API is pinned to one replica and uses a local,
disposable SQLite database. ACR admin access is disabled; the deployment and
runtime identities use GitHub OIDC and managed identity role assignments.

## Prerequisites and deployment

1. Prepare an Azure subscription, budget, Container Apps region/quota, Azure CLI,
   GitHub CLI, and a protected GitHub Environment.
2. Register the required providers and bootstrap OIDC once:

   ```bash
   az provider register --namespace Microsoft.App
   az provider register --namespace Microsoft.OperationalInsights
   az provider register --namespace Microsoft.ContainerRegistry
   az provider register --namespace Microsoft.ManagedIdentity

   ./scripts/setup-oidc.sh -g <resource-group> -l <region> \
     -r <owner/repo> -e demo
   ```

3. Configure the `demo` GitHub Environment with the approval rules appropriate
   for the event. The deployment identity needs Contributor and User Access
   Administrator scoped to the resource group so Bicep can create ACR role
   assignments. No client secret is needed.
4. Run **Actions → Deploy C# API and frontend → Run workflow**, or push to
   `main`. The workflow builds/tests both apps, compiles and validates Bicep,
   provisions shared infrastructure, pushes commit-SHA images, deploys both
   apps, waits for ready revisions, and exercises the API flow through the
   frontend.
5. Open the frontend URL in the run summary and verify product browsing, order
   creation, and order history.

For exact configuration, verification commands, failure diagnosis, rollback, and
cleanup, follow the [Azure deployment guide](../../infra/README.md).

## Operational limits

The API is internal-only; the browser uses the frontend origin and never sees the
API hostname or target port. Readiness requires a successful SQLite database
check; liveness does not depend on database availability. The API must remain at
exactly one replica because each container has its own local database.

SQLite data is not durable. Container replacement, a new revision, or scaling
events can reset demo data. Rolling back image versions deploys prior application
code but does not restore lost data. SQLite WAL mode is used, so Azure Files is
not presented as a drop-in persistence option.

The deployment is a baseline demo, not production guidance: durable storage,
backups, private networking, application authentication, and high availability
remain out of scope.

You successfully completed Challenge 5! 🚀🚀🚀
