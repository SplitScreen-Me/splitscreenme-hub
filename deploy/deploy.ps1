<#
  Builds the site image locally and loads it on the server (docs/ARCHITECTURE.md section 9.6).
  Never builds on the server. PowerShell 5.1: binary data goes through files, not the PowerShell pipeline.

  .\deploy\deploy.ps1                 # build, upload, load; prints the tag to put in /root/v3/.env
  .\deploy\deploy.ps1 -Up             # also set SITE_TAG on the server and `docker compose up -d`
  .\deploy\deploy.ps1 -Tag abc1234    # redeploy an image already built locally
#>
param(
  [string]$Tag,
  [switch]$Up,
  [string]$Server = 'root@hub.splitscreen.me'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'
$scp = 'C:\Windows\System32\OpenSSH\scp.exe'

if (-not $Tag) {
  $dirty = git -C $repo status --porcelain
  if ($dirty) { throw 'Working tree has uncommitted changes: commit first so the tag names the code.' }
  $Tag = (git -C $repo rev-parse --short HEAD).Trim()
  docker build --platform linux/amd64 -t "ssm-site:$Tag" $repo
  if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }
}

$tar = Join-Path $env:TEMP "ssm-site-$Tag.tar"
docker save -o $tar "ssm-site:$Tag"
if ($LASTEXITCODE -ne 0) { throw 'docker save failed' }
try {
  & $ssh -o BatchMode=yes $Server 'mkdir -p /root/v3/images'
  & $scp $tar "${Server}:/root/v3/images/"
  if ($LASTEXITCODE -ne 0) { throw 'scp failed' }
  & $ssh -o BatchMode=yes $Server "docker load -i /root/v3/images/ssm-site-$Tag.tar && rm /root/v3/images/ssm-site-$Tag.tar"
  if ($LASTEXITCODE -ne 0) { throw 'docker load failed' }
} finally {
  Remove-Item $tar -ErrorAction SilentlyContinue
}

if ($Up) {
  # Back up the database before a release (migrations run at container start). A failed or empty dump
  # aborts before SITE_TAG changes; only a first deployment (no running database) has nothing to dump.
  # No double quotes in the remote command: PowerShell 5.1 does not escape them for native programs.
  $dump = "backups/pre-$Tag.dump"
  $cmd = 'set -e; cd /root/v3; mkdir -p backups; ' +
    'if docker compose ps --status running --services 2>/dev/null | grep -qx db; then ' +
    "docker compose exec -T db pg_dump -U ssm -Fc ssm > $dump.part || { rm -f $dump.part; echo 'pg_dump failed: release aborted' >&2; exit 1; }; " +
    "test -s $dump.part || { rm -f $dump.part; echo 'empty dump: release aborted' >&2; exit 1; }; " +
    "mv $dump.part $dump; echo 'backup written: $dump'; " +
    "else echo 'no running database (first deployment): nothing to back up'; fi; " +
    "sed -i 's/^SITE_TAG=.*/SITE_TAG=$Tag/' .env; docker compose up -d; docker compose ps"
  & $ssh -o BatchMode=yes $Server $cmd
  if ($LASTEXITCODE -ne 0) { throw 'compose up failed' }
} else {
  Write-Output "Loaded ssm-site:$Tag. On the server: set SITE_TAG=$Tag in /root/v3/.env, then docker compose up -d."
}
