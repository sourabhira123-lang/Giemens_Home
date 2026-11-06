@description('Azure region for the Container Apps resources.')
param location string = resourceGroup().location

@description('Globally unique Container App name.')
param appName string

@description('Globally unique lowercase Azure Storage account name.')
param storageAccountName string

@description('Name of the existing Log Analytics workspace.')
param logAnalyticsWorkspaceName string

@description('Exact HTTPS origin allowed to upload documents from the browser.')
param siteOrigin string

@description('Name of an existing Azure Container Registry.')
param containerRegistryName string

@description('Login server of the existing Azure Container Registry.')
param containerRegistryServer string

@description('Image path and immutable tag in ACR.')
param containerImage string

@secure()
@description('Full PostgreSQL URL including the password; stored as a Container App secret.')
param databaseUrl string

@secure()
param authRateLimitSecret string

@secure()
param metricsAuthToken string

@secure()
param smtpUser string

@secure()
param smtpPassword string

@secure()
param redisRestToken string

@allowed([
  'custom'
  'microsoft365'
  'google-workspace'
  'zoho'
])
param smtpProvider string = 'custom'
param smtpHost string
param smtpPort string = '587'
@description('Private hostname for the ClamAV daemon reachable from the Container App.')
param clamavHost string
param clamavPort string = '3310'
param contactToEmail string
param contactFromEmail string
param redisRestUrl string
@description('Optional private OTLP HTTP(S) collector endpoint; leave empty to disable export.')
param otelExporterOtlpEndpoint string = ''
param minReplicas int = 1
param maxReplicas int = 3

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var blobContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var blobDelegatorRoleId = 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a'
resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${appName}-pull'
  location: location
}

resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, pullIdentity.id, acrPullRoleId)
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: pullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: [
            siteOrigin
          ]
          allowedMethods: [
            'PUT'
            'OPTIONS'
            'HEAD'
          ]
          allowedHeaders: [
            'content-type'
            'x-ms-blob-type'
          ]
          exposedHeaders: [
            'ETag'
            'x-ms-request-id'
          ]
          maxAgeInSeconds: 300
        }
      ]
    }
  }
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'documents'
  properties: {
    publicAccess: 'None'
  }
}

resource blobContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(documentsContainer.id, pullIdentity.id, blobContributorRoleId)
  scope: documentsContainer
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobContributorRoleId)
    principalId: pullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource blobDelegatorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, pullIdentity.id, blobDelegatorRoleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDelegatorRoleId)
    principalId: pullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${appName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  dependsOn: [
    acrPullAssignment
    blobContributorAssignment
    blobDelegatorAssignment
  ]
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${pullIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: containerRegistryServer
          identity: pullIdentity.id
        }
      ]
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'auth-rate-limit-secret'
          value: authRateLimitSecret
        }
        {
          name: 'metrics-auth-token'
          value: metricsAuthToken
        }
        {
          name: 'smtp-user'
          value: smtpUser
        }
        {
          name: 'smtp-password'
          value: smtpPassword
        }
        {
          name: 'redis-rest-token'
          value: redisRestToken
        }
      ]
    }
    template: {
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
      containers: [
        {
          name: appName
          image: containerImage
          resources: {
            cpu: 0.5
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'AUTH_RATE_LIMIT_SECRET'
              secretRef: 'auth-rate-limit-secret'
            }
            {
              name: 'METRICS_AUTH_TOKEN'
              secretRef: 'metrics-auth-token'
            }
            {
              name: 'SMTP_HOST'
              value: smtpHost
            }
            {
              name: 'SMTP_PROVIDER'
              value: smtpProvider
            }
            {
              name: 'SMTP_PORT'
              value: smtpPort
            }
            {
              name: 'SMTP_USER'
              secretRef: 'smtp-user'
            }
            {
              name: 'SMTP_PASSWORD'
              secretRef: 'smtp-password'
            }
            {
              name: 'CONTACT_TO_EMAIL'
              value: contactToEmail
            }
            {
              name: 'CONTACT_FROM_EMAIL'
              value: contactFromEmail
            }
            {
              name: 'CLAMAV_HOST'
              value: clamavHost
            }
            {
              name: 'CLAMAV_PORT'
              value: clamavPort
            }
            {
              name: 'OTEL_EXPORTER_OTLP_ENDPOINT'
              value: otelExporterOtlpEndpoint
            }
            {
              name: 'DOCUMENT_PENDING_RETENTION_HOURS'
              value: '24'
            }
            {
              name: 'DOCUMENT_REJECTED_RETENTION_DAYS'
              value: '30'
            }
            {
              name: 'UPSTASH_REDIS_REST_URL'
              value: redisRestUrl
            }
            {
              name: 'UPSTASH_REDIS_REST_TOKEN'
              secretRef: 'redis-rest-token'
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_URL'
              value: 'https://${storage.name}.blob.core.windows.net'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: pullIdentity.properties.clientId
            }
            {
              name: 'AZURE_STORAGE_CONTAINER'
              value: documentsContainer.name
            }
            {
              name: 'TRUST_PROXY_HOPS'
              value: '0'
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/liveness'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              failureThreshold: 10
              periodSeconds: 10
              timeoutSeconds: 3
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/liveness'
                port: 3000
                scheme: 'HTTP'
              }
              periodSeconds: 30
              timeoutSeconds: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: 3000
                scheme: 'HTTP'
              }
              periodSeconds: 10
              timeoutSeconds: 5
            }
          ]
        }
      ]
    }
  }
}

output appFqdn string = app.properties.configuration.ingress.fqdn
