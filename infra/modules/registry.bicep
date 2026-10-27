@description('Azure region for the registry.')
param location string

@description('Globally-unique name for the container registry (alphanumeric, 5-50 chars).')
param registryName string

@description('Tags applied to the registry.')
param tags object = {}

@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param sku string = 'Basic'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: sku
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

@description('The login server host name of the registry (e.g. myregistry.azurecr.io).')
output loginServer string = registry.properties.loginServer

@description('The resource ID of the registry (useful for role assignments).')
output registryId string = registry.id

@description('The name of the registry.')
output registryName string = registry.name
