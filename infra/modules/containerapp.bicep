@description('Azure region for the app.')
param location string

@description('Name of the container app.')
param appName string

@description('Resource ID of the Container Apps managed environment.')
param environmentId string

@description('Fully-qualified image reference.')
param image string

@description('Port the container listens on.')
param targetPort int

@description('Whether ingress is public or internal to the Container Apps environment.')
param externalIngress bool

@description('Login server of the ACR that hosts the image.')
param registryLoginServer string

@description('Resource ID of the user-assigned managed identity used for ACR pulls.')
param identityResourceId string

@description('Environment variables for the container.')
param env array = []

@description('Health probes for this workload.')
param probes array = []

@description('Tags applied to the app.')
param tags object = {}

@minValue(0)
param minReplicas int = 1

@minValue(1)
param maxReplicas int = 1

param cpu string = '0.5'
param memory string = '1.0Gi'

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityResourceId}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: externalIngress
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            weight: 100
            latestRevision: true
          }
        ]
      }
      registries: [
        {
          server: registryLoginServer
          identity: identityResourceId
        }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: env
          probes: probes
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

@description('The fully-qualified domain name of the app.')
output fqdn string = containerApp.properties.configuration.ingress.fqdn

@description('The name of the container app.')
output appName string = containerApp.name
