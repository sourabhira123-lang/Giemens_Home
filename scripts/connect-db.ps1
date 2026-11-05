[CmdletBinding()]
param(
  [string]$HostName = '127.0.0.1',
  [ValidateRange(1, 65535)]
  [int]$Port = 5432,
  [string]$Database = 'giemens',
  [string]$Username = 'postgres'
)

$ErrorActionPreference = 'Stop'
if ($HostName -notin @('127.0.0.1', 'localhost', '::1') -or $Database -ne 'giemens') {
  throw 'This helper only connects to the local giemens development database.'
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if ($psql) {
  $psqlPath = $psql.Source
} else {
  $psqlPath = @(
    'C:\Program Files\PostgreSQL\18\bin\psql.exe',
    'C:\Program Files\PostgreSQL\17\bin\psql.exe',
    'C:\Program Files\PostgreSQL\14\bin\psql.exe'
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
}
if (-not $psqlPath) {
  throw 'psql was not found. Install PostgreSQL command-line tools or connect using pgAdmin.'
}

$query = @"
SELECT current_database() AS database,
       current_user AS role,
       EXISTS (
         SELECT 1
         FROM information_schema.schemata
         WHERE schema_name = 'giemens_crm'
       ) AS giemens_crm_schema_exists;
"@

Write-Output "Connecting to $HostName`:$Port/$Database as $Username. psql will prompt for the password."
& $psqlPath -h $HostName -p $Port -U $Username -d $Database -W -v ON_ERROR_STOP=1 -c $query
if ($LASTEXITCODE -ne 0) {
  throw "psql connection or verification failed with exit code $LASTEXITCODE."
}
