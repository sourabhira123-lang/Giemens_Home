[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSScriptRoot 'postgres-local.psm1') -Force
Set-Location $repositoryRoot

$localEnvironment = Join-Path $repositoryRoot '.env.local'
$target = Get-GiemensLocalDatabaseTarget -EnvironmentFile $localEnvironment
Test-GiemensPostgresListener -Target $target
Set-GiemensPrismaDatabaseUrl -Target $target

$rootEnvironment = Join-Path $repositoryRoot '.env'
if (Test-Path -LiteralPath $rootEnvironment -PathType Leaf) {
  $rootLine = Get-Content -LiteralPath $rootEnvironment |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1
  if ($rootLine) {
    $rootUrl = ($rootLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
    if ($rootUrl -ne $target.Url) {
      Write-Warning '.env and .env.local DATABASE_URL values differ. This check explicitly uses .env.local; synchronize both files before running Prisma commands outside this helper.'
    }
  }
}

Write-Output "Target format verified: $($target.Host):$($target.Port)/$($target.Database), schema=$($target.Schema). Password is not displayed."

& npm.cmd run prisma:validate
if ($LASTEXITCODE -ne 0) { throw 'Prisma schema validation failed.' }

& npm.cmd run prisma:generate
if ($LASTEXITCODE -ne 0) { throw 'Prisma Client generation failed.' }

$statusOutput = & $env:ComSpec /d /s /c 'npx.cmd prisma migrate status --schema prisma/schema.prisma 2>&1'
$statusExitCode = $LASTEXITCODE
$statusText = $statusOutput | Out-String
$statusOutput | ForEach-Object { Write-Output $_ }
if ($statusExitCode -ne 0) {
  if ($statusText -match 'Following migration have not yet been applied:') {
    Write-Warning 'PostgreSQL authentication succeeded. One or more migrations are pending; no migrations or seed data were applied.'
  } else {
    throw 'Prisma could not verify migration status. Check the PostgreSQL service, role password, database privileges, and connection URL.'
  }
}

Write-Output 'Database connection and migration status check completed. No migrations or seed data were applied.'
