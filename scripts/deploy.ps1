param(
  [string]$WorkerName = "cloudflare-webdav",
  [string]$D1Name = "cloudflare-webdav",
  [string]$KVNamespaceName = "cloudflare-webdav-files",
  [string]$AdminPagesProject = "cloudflare-webdav-admin",
  [string]$UserPagesProject = "cloudflare-webdav-user",
  [switch]$SkipPages,
  [switch]$SkipWorker
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Wrangler {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & npx wrangler @Arguments
}

function Test-Command {
  param([string]$Command)
  return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

function Get-JsonFromOutput {
  param([string[]]$Lines)
  $text = ($Lines -join "`n")
  $start = $text.IndexOf("{")
  if ($start -lt 0) {
    return $null
  }
  try {
    return $text.Substring($start) | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-D1DatabaseId {
  param([string]$Name)
  $output = Invoke-Wrangler d1 list --json 2>$null
  $items = $output | ConvertFrom-Json
  $match = $items | Where-Object { $_.name -eq $Name } | Select-Object -First 1
  return $match.uuid
}

function Ensure-D1 {
  param([string]$Name)
  Write-Step "Checking D1 database: $Name"
  $existing = Get-D1DatabaseId $Name
  if ($existing) {
    Write-Host "Reusing D1: $existing"
    return $existing
  }

  Write-Host "Creating D1 database..."
  $output = Invoke-Wrangler d1 create $Name --json
  $json = Get-JsonFromOutput $output
  if ($json -and $json.uuid) {
    return $json.uuid
  }

  $created = Get-D1DatabaseId $Name
  if (-not $created) {
    throw "Could not determine D1 database_id from Wrangler output."
  }
  return $created
}

function Get-KVNamespaceId {
  param([string]$Title)
  $output = Invoke-Wrangler kv namespace list 2>$null
  $items = $output | ConvertFrom-Json
  $match = $items | Where-Object { $_.title -eq $Title } | Select-Object -First 1
  return $match.id
}

function Ensure-KV {
  param([string]$Title)
  Write-Step "Checking KV namespace: $Title"
  $existing = Get-KVNamespaceId $Title
  if ($existing) {
    Write-Host "Reusing KV: $existing"
    return $existing
  }

  Write-Host "Creating KV namespace..."
  $output = Invoke-Wrangler kv namespace create $Title
  $text = $output -join "`n"
  $idMatch = [regex]::Match($text, 'id\s*=\s*"([^"]+)"')
  if ($idMatch.Success) {
    return $idMatch.Groups[1].Value
  }

  $created = Get-KVNamespaceId $Title
  if (-not $created) {
    throw "Could not determine KV namespace id from Wrangler output."
  }
  return $created
}

function Update-WranglerConfig {
  param(
    [string]$D1Id,
    [string]$KVId
  )

  if (-not (Test-Path "wrangler.jsonc")) {
    Write-Host "wrangler.jsonc not found; skipping binding update."
    return
  }

  Write-Step "Updating wrangler.jsonc bindings"
  $content = Get-Content -Raw -Encoding UTF8 "wrangler.jsonc"
  $content = $content -replace '"database_name"\s*:\s*"[^"]+"', ('"database_name": "' + $D1Name + '"')
  $content = $content -replace '"database_id"\s*:\s*"[^"]+"', ('"database_id": "' + $D1Id + '"')
  $content = $content -replace '"id"\s*:\s*"[^"]+"', ('"id": "' + $KVId + '"')
  [System.IO.File]::WriteAllText((Resolve-Path "wrangler.jsonc"), $content, [System.Text.UTF8Encoding]::new($false))
}

function Set-Secret {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name cannot be empty."
  }

  $Value | & npx wrangler secret put $Name
}

function Ensure-PagesProject {
  param([string]$Project)
  $list = Invoke-Wrangler pages project list 2>$null
  $text = $list -join "`n"
  if ($text -match [regex]::Escape($Project)) {
    Write-Host "Reusing Pages project: $Project"
    return
  }

  Write-Host "Creating Pages project: $Project"
  Invoke-Wrangler pages project create $Project
}

if (-not (Test-Command "node")) {
  throw "Node.js was not found. Install Node.js 18 or newer first."
}

Write-Step "Checking Cloudflare login"
Invoke-Wrangler whoami

if (Test-Path "package.json") {
  Write-Step "Installing dependencies"
  npm install
}

$d1Id = Ensure-D1 $D1Name
$kvId = Ensure-KV $KVNamespaceName
Update-WranglerConfig -D1Id $d1Id -KVId $kvId

if (-not $SkipWorker) {
  Write-Step "Configuring admin variables and secrets"
  $adminUsername = Read-Host "ADMIN_USERNAME"
  if ([string]::IsNullOrWhiteSpace($adminUsername)) {
    throw "ADMIN_USERNAME cannot be empty."
  }

  if (Test-Path "wrangler.jsonc") {
    $config = Get-Content -Raw -Encoding UTF8 "wrangler.jsonc"
    if ($config -match '"vars"\s*:\s*\{') {
      $config = $config -replace '"ADMIN_USERNAME"\s*:\s*"[^"]+"', ('"ADMIN_USERNAME": "' + $adminUsername + '"')
      if ($config -notmatch '"ADMIN_USERNAME"') {
        $insert = '"vars": {' + "`n    " + '"ADMIN_USERNAME": "' + $adminUsername + '",'
        $config = $config -replace '"vars"\s*:\s*\{', $insert
      }
      [System.IO.File]::WriteAllText((Resolve-Path "wrangler.jsonc"), $config, [System.Text.UTF8Encoding]::new($false))
    } else {
      Write-Host "wrangler.jsonc has no vars block; add ADMIN_USERNAME manually if needed."
    }
  }

  $adminPassword = Read-Host "ADMIN_PASSWORD" -AsSecureString
  $adminPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword)
  )
  Set-Secret -Name "ADMIN_PASSWORD" -Value $adminPasswordText

  $jwtSecret = Read-Host "JWT_SECRET (leave empty to auto-generate)"
  if ([string]::IsNullOrWhiteSpace($jwtSecret)) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $jwtSecret = [Convert]::ToBase64String($bytes)
  }
  Set-Secret -Name "JWT_SECRET" -Value $jwtSecret

  if ((Test-Path "migrations") -and (Test-Path "wrangler.jsonc")) {
    Write-Step "Applying D1 migrations"
    Invoke-Wrangler d1 migrations apply $D1Name --remote
  }

  if ((Test-Path "wrangler.jsonc") -and (Test-Path "src")) {
    Write-Step "Deploying Worker"
    Invoke-Wrangler deploy
  } else {
    Write-Host "wrangler.jsonc or src/ not found; skipping Worker deploy."
  }
}

if (-not $SkipPages) {
  if (Test-Path "pages-admin") {
    Write-Step "Deploying admin Pages"
    Ensure-PagesProject $AdminPagesProject
    Invoke-Wrangler pages deploy ".\pages-admin" --project-name $AdminPagesProject
  }

  if (Test-Path "pages-user") {
    Write-Step "Deploying user Pages"
    Ensure-PagesProject $UserPagesProject
    Invoke-Wrangler pages deploy ".\pages-user" --project-name $UserPagesProject
  }
}

Write-Step "Deploy flow complete"
Write-Host "D1 database_id: $d1Id"
Write-Host "KV namespace id: $kvId"
