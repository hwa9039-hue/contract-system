# PostgreSQL 덤프 백업 (Windows / PowerShell)
# - DATABASE_URL: 환경변수 또는 프로젝트 .env / backend\.env
# - BACKUP_DIR:   미설정 시 <프로젝트>/backups
$ErrorActionPreference = "Stop"

$ProjectRoot = if ($env:CMS_PROJECT_ROOT) {
    (Resolve-Path $env:CMS_PROJECT_ROOT).Path
} else {
    (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-DotEnvValue {
    param(
        [string] $Path,
        [string] $Key
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
            continue
        }
        if ($trimmed -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
            $value = $Matches[1].Trim()
            if ($value.Length -ge 2) {
                $q = $value[0]
                if (($q -eq '"' -or $q -eq "'") -and $value[-1] -eq $q) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
            }
            return $value
        }
    }

    return $null
}

if (-not $env:DATABASE_URL) {
    foreach ($rel in @(".env", "backend\.env")) {
        $value = Get-DotEnvValue -Path (Join-Path $ProjectRoot $rel) -Key "DATABASE_URL"
        if ($value) {
            $env:DATABASE_URL = $value
            break
        }
    }
}

if (-not $env:DATABASE_URL) {
    throw @"
DATABASE_URL is not set.
  - Add DATABASE_URL=... to $ProjectRoot\.env
  - Or set `$env:DATABASE_URL before running this script
"@
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    throw "pg_dump not found. Install PostgreSQL client tools and add pg_dump to PATH."
}

$backupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $ProjectRoot "backups" }
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$out = Join-Path $backupDir ("pg_backup_{0}.dump" -f (Get-Date -Format "yyyyMMdd_HHmmss"))

& pg_dump --dbname=$env:DATABASE_URL -Fc -f $out
Write-Host "Backup written to $out"
