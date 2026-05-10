$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
    throw "DATABASE_URL is not set."
}

$BackupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path (Get-Location) "backups" }
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$out = Join-Path $BackupDir "pg_backup_$stamp.dump"

& pg_dump --dbname=$env:DATABASE_URL -Fc -f $out
Write-Host "Backup written to $out"
