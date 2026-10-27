targetScope = 'resourceGroup'

@description('Azure region for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Lowercase alphanumeric prefix used for resource names.')
@minLength(2)
@maxLength(12)
param namePrefix string = 'octocat'

@description('Short environment suffix used for resource names.')
@minLength(2)
@maxLength(8)
param environmentName string = 'dev'

@description('Provision only shared infrastructure first, then deploy application images.')
@allowed([
  'foundation'
  'apps'
])
param deploymentStage string = 'foundation'

@description('Image reference used during the apps stage.')
param apiImage string = ''

@description('Image reference used during the apps stage.')
param frontendImage string = ''

@description('Principal object ID of the OIDC deployment identity.')
param deployerPrincipalId string

var baseName = '${namePrefix}-${environmentName}'
var registryName = toLower(replace('${namePrefix}${environmentName}acr${uniqueString(subscription().id, resourceGroup().id)}', '-', ''))
var logAnalyticsName = '${baseName}-logs'
var environmentResourceName = '${baseName}-env'
var apiAppName = '${baseName}-api'
var frontendAppName = '${baseName}-frontend'
var apiIdentityName = '${baseName}-api-pull'
var frontendIdentityName = '${baseName}-frontend-pull'
var deployApps = deploymentStage == 'apps'
var acrPullRoleId = '7f951dda-4ed3-468a-a7ca-43fe172d538d'
var acrPushRoleId = '8311e382-0749-4cb8-b61a-304f252e45ec'

var commonTags = {
  project: 'octocat-supply'
  challenge: 'challenge-5-azure-deploy'
  managedBy: 'bicep'
  environment: environmentName
}

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    location: location
    registryName: registryName
    tags: commonTags
  }
}

module logAnalytics 'modules/loganalytics.bicep' = {
  name: 'loganalytics'
  params: {
    location: location
    workspaceName: logAnalyticsName
    tags: commonTags
  }
}

module environment 'modules/containerapp-env.bicep' = {
  name: 'containerapp-env'
  params: {
    location: location
    environmentName: environmentResourceName
    logAnalyticsWorkspaceId: logAnalytics.outputs.workspaceId
    tags: commonTags
  }
}

resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: apiIdentityName
  location: location
  tags: commonTags
}

resource frontendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: frontendIdentityName
  location: location
  tags: commonTags
}

resource registryScope 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource apiAcrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registryScope.id, apiIdentity.id, acrPullRoleId)
  scope: registryScope
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    registry
  ]
}

resource frontendAcrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registryScope.id, frontendIdentity.id, acrPullRoleId)
  scope: registryScope
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: frontendIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    registry
  ]
}

resource deployerAcrPushAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registryScope.id, deployerPrincipalId, acrPushRoleId)
  scope: registryScope
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPushRoleId)
    principalId: deployerPrincipalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    registry
  ]
}

module apiApp 'modules/containerapp.bicep' = if (deployApps) {
  name: 'api-app'
  params: {
    location: location
    appName: apiAppName
    environmentId: environment.outputs.environmentId
    image: apiImage
    targetPort: 3000
    externalIngress: false
    registryLoginServer: registry.outputs.loginServer
    identityResourceId: apiIdentity.id
    minReplicas: 1
    maxReplicas: 1
    tags: commonTags
    env: [
      {
        name: 'PORT'
        value: '3000'
      }
      {
        name: 'DB_FILE'
        value: '/tmp/octosupply/app.db'
      }
      {
        name: 'DB_MIGRATIONS_DIR'
        value: '/database/migrations'
      }
      {
        name: 'DB_SEED_DIR'
        value: '/database/seed'
      }
    ]
    probes: [
      {
        type: 'Startup'
        httpGet: {
          path: '/health/ready'
          port: 3000
          scheme: 'HTTP'
        }
        periodSeconds: 5
        failureThreshold: 30
      }
      {
        type: 'Readiness'
        httpGet: {
          path: '/health/ready'
          port: 3000
          scheme: 'HTTP'
        }
        periodSeconds: 10
        failureThreshold: 3
      }
      {
        type: 'Liveness'
        httpGet: {
          path: '/health/live'
          port: 3000
          scheme: 'HTTP'
        }
        periodSeconds: 30
        failureThreshold: 3
      }
    ]
  }
  dependsOn: [
    apiAcrPullAssignment
    deployerAcrPushAssignment
  ]
}

module frontendApp 'modules/containerapp.bicep' = if (deployApps) {
  name: 'frontend-app'
  params: {
    location: location
    appName: frontendAppName
    environmentId: environment.outputs.environmentId
    image: frontendImage
    targetPort: 80
    externalIngress: true
    registryLoginServer: registry.outputs.loginServer
    identityResourceId: frontendIdentity.id
    minReplicas: 1
    maxReplicas: 3
    tags: commonTags
    env: [
      {
        name: 'API_HOST'
        value: apiApp!.outputs.fqdn
      }
      {
        name: 'API_PORT'
        value: '443'
      }
      {
        name: 'API_PROTOCOL'
        value: 'https'
      }
      {
        name: 'API_RESOLVER'
        value: '168.63.129.16'
      }
    ]
    probes: [
      {
        type: 'Startup'
        httpGet: {
          path: '/'
          port: 80
          scheme: 'HTTP'
        }
        periodSeconds: 5
        failureThreshold: 30
      }
      {
        type: 'Readiness'
        httpGet: {
          path: '/'
          port: 80
          scheme: 'HTTP'
        }
        periodSeconds: 10
        failureThreshold: 3
      }
      {
        type: 'Liveness'
        httpGet: {
          path: '/'
          port: 80
          scheme: 'HTTP'
        }
        periodSeconds: 30
        failureThreshold: 3
      }
    ]
  }
  dependsOn: [
    frontendAcrPullAssignment
    deployerAcrPushAssignment
  ]
}

@description('ACR login server for image builds and pulls.')
output acrLoginServer string = registry.outputs.loginServer

@description('Globally unique Azure Container Registry name.')
output acrName string = registry.outputs.registryName

@description('Resource ID of the Azure Container Registry.')
output acrResourceId string = registry.outputs.registryId

@description('Resource ID of the API managed identity.')
output apiIdentityResourceId string = apiIdentity.id

@description('Resource ID of the frontend managed identity.')
output frontendIdentityResourceId string = frontendIdentity.id

@description('API Container App name; API ingress is internal.')
output apiAppName string = apiAppName

@description('Frontend Container App name.')
output frontendAppName string = frontendAppName

@description('Internal API ingress FQDN.')
output apiFqdn string = deployApps ? apiApp!.outputs.fqdn : ''

@description('Public frontend URL; empty until the apps stage is deployed.')
output frontendUrl string = deployApps ? 'https://${frontendApp!.outputs.fqdn}' : ''
