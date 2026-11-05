Set-StrictMode -Version Latest

function Get-GiemensLocalDatabaseTarget {
  param(
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentFile
  )

  if (-not (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf)) {
    throw "Environment file not found: $EnvironmentFile. Copy .env.example to .env.local and set DATABASE_URL."
  }

  $databaseLine = Get-Content -LiteralPath $EnvironmentFile |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1
  if (-not $databaseLine) {
    throw "DATABASE_URL is missing from $EnvironmentFile."
  }

  $databaseUrl = ($databaseLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim()
  if ($databaseUrl.Length -ge 2 -and
    (($databaseUrl.StartsWith('"') -and $databaseUrl.EndsWith('"')) -or
      ($databaseUrl.StartsWith("'") -and $databaseUrl.EndsWith("'")))) {
    $databaseUrl = $databaseUrl.Substring(1, $databaseUrl.Length - 2)
  }

  $schemeMatch = [regex]::Match($databaseUrl, '^(?<scheme>postgresql|postgres)://')
  if (-not $schemeMatch.Success) {
    throw 'DATABASE_URL must use the postgresql:// or postgres:// scheme.'
  }
  $rest = $databaseUrl.Substring($schemeMatch.Length)
  $pathStart = $rest.IndexOf('/')
  if ($pathStart -lt 0) {
    throw 'DATABASE_URL is missing the database path.'
  }
  $authority = $rest.Substring(0, $pathStart)
  $atIndex = $authority.LastIndexOf('@')
  $colonIndex = $authority.IndexOf(':')
  if ($atIndex -ge 0 -and $colonIndex -gt 0 -and $colonIndex -lt $atIndex) {
    $rawPassword = $authority.Substring($colonIndex + 1, $atIndex - $colonIndex - 1)
    if ($rawPassword.Contains('@')) {
      $username = $authority.Substring(0, $colonIndex)
      $hostPort = $authority.Substring($atIndex + 1)
      $encodedPassword = [uri]::EscapeDataString($rawPassword)
      $databaseUrl = "$($schemeMatch.Value)$username`:$encodedPassword@$hostPort$($rest.Substring($pathStart))"
      Write-Warning 'A raw reserved character was normalized in memory for this check only. Update .env.local and .env using a URL-encoded password; no file was changed.'
    }
  }

  $pattern = '^postgres(?:ql)?://(?<username>[A-Za-z0-9._~-]+):(?<password>(?:%[0-9A-Fa-f]{2}|[A-Za-z0-9._~-])+)@(?<host>[^:/?#]+)(?::(?<port>\d+))?/(?<database>[^/?#]+)\?schema=(?<schema>[^&#]+)$'
  $match = [regex]::Match($databaseUrl, $pattern)
  if (-not $match.Success) {
    throw "DATABASE_URL is malformed. Use postgresql://USER:URL_ENCODED_PASSWORD@127.0.0.1:5432/giemens?schema=giemens_crm."
  }

  $port = if ($match.Groups['port'].Success) {
    [int]$match.Groups['port'].Value
  } else {
    5432
  }
  $target = [pscustomobject]@{
    Url      = $databaseUrl
    Username = $match.Groups['username'].Value
    Host     = $match.Groups['host'].Value
    Port     = $port
    Database = $match.Groups['database'].Value
    Schema   = $match.Groups['schema'].Value
  }

  if ($target.Host -notin @('127.0.0.1', 'localhost', '::1') -or
    $target.Port -ne 5432 -or
    $target.Database -ne 'giemens' -or
    $target.Schema -ne 'giemens_crm') {
    throw "Refusing non-local or unexpected target. Expected loopback:5432/giemens?schema=giemens_crm; no password was displayed."
  }

  return $target
}

function Test-GiemensPostgresListener {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Target
  )

  $reachable = Test-NetConnection `
    -ComputerName $Target.Host `
    -Port $Target.Port `
    -InformationLevel Quiet `
    -WarningAction SilentlyContinue
  if (-not $reachable) {
    throw "No PostgreSQL TCP listener is reachable at $($Target.Host):$($Target.Port). Check the PostgreSQL Windows service and configured port."
  }
}

function Set-GiemensPrismaDatabaseUrl {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Target
  )

  $env:DATABASE_URL = $Target.Url
}

Export-ModuleMember -Function Get-GiemensLocalDatabaseTarget, Test-GiemensPostgresListener, Set-GiemensPrismaDatabaseUrl
