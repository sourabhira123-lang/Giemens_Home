[CmdletBinding()]
param(
  [switch]$IUnderstandDataLoss
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSScriptRoot 'postgres-local.psm1') -Force
Set-Location $repositoryRoot

if (-not $IUnderstandDataLoss) {
  throw 'This command DROPS and recreates the local giemens_crm schema. Back up needed data, then rerun with -IUnderstandDataLoss and type RESET giemens when prompted.'
}

$localEnvironment = Join-Path $repositoryRoot '.env.local'
$target = Get-GiemensLocalDatabaseTarget -EnvironmentFile $localEnvironment
Test-GiemensPostgresListener -Target $target
Set-GiemensPrismaDatabaseUrl -Target $target

Write-Warning "ALL DATA in the local schema $($target.Schema) will be destroyed. This helper refuses non-loopback hosts and databases other than giemens."
$confirmation = Read-Host 'Type RESET giemens to continue'
if ($confirmation -cne 'RESET giemens') {
  throw 'Confirmation did not match. No reset was performed.'
}

& npx.cmd prisma migrate reset --schema prisma/schema.prisma --force
if ($LASTEXITCODE -ne 0) {
  throw 'Local development reset failed. Check PostgreSQL authentication and migration output.'
}

Write-Output 'Local development schema reset completed. Prisma may have run the configured seed.'
