# Builds a deploy folder from a map style folder and, with -deploy, copies it to the head unit.
#
# Set up for the 2017 Audi A4 with MMI Navigation plus (Australia): it stages the stock Audi
# styles in mapstyles-audidefault, swaps in MapConfigs exported from the previewer
# (-mapConfigs), and copies the result to the head unit over SSH.
#
# The Audi style folder on the head unit hasn't been confirmed on an A4 yet. Run with -list to
# see the map style folders on the unit, then pass the right one with -destPath. Deploying stops
# if that folder doesn't exist, so nothing lands in the wrong place.
param (
  [switch] $deploy = $false,
  [switch] $backup = $false,
  [switch] $list = $false,
  [string] $styles = 'mapstyles-audidefault',
  [string] $mapConfigs = '',
  [string] $destPath = '/mnt/app/navigation/resources/app/audi/aus/',
  [switch] $vwBuilder = $false
)

$navRoot = '/mnt/app/navigation/resources/app/';
if ($destPath -notmatch '/$') { $destPath += '/' }

if ($list) {
  Write-Host "Map style folders on the head unit:";
  &ssh mib2 "ls -d $navRoot*/*/";
  exit $LASTEXITCODE;
}

#directories
$projectRoot = "$(&git rev-parse --show-toplevel)";

$styleSrc = Join-Path $projectRoot $styles;
$stagingDir = "$projectRoot/deploy";
$mapBuilder = "$projectRoot/mib2-mapbuilder";

#backup
$backupName = '{0:yyyyMMdd-HHmmss}' -f (Get-Date);
$backupRoot = "$projectRoot/backup";
$backupDir = "$backupRoot/$($backupName)";

if (-not (Test-Path $styleSrc)) {
  Write-Error "Style folder not found: $styleSrc";
  exit 1;
}

Write-Host "Directories:";
Write-host "--> Style source: $styleSrc";
Write-host "--> Staging target: $stagingDir";
if($deploy -eq $true) {
  Write-host "--> Head unit target: $destPath";
  if($backup -eq $true) {
    Write-host "--> Backup target: $backupDir";
  }
}

Write-Host "Begin Staging build";
Write-Host "--> Emptying Staging Dir";
Remove-Item -Path $stagingDir -Recurse -Force -ErrorAction SilentlyContinue;
New-Item -ItemType Directory $stagingDir | Out-Null;

# The style folder is a copy of the one on the head unit, so stage all of it.
Write-Host "--> Copying $styles";
Copy-Item -Path "$styleSrc/*" -Destination $stagingDir -Recurse;
Get-ChildItem -Path $stagingDir -Recurse -Force -Include '.DS_Store', '*.md', '*.ps1' | Remove-Item -Force;

if($vwBuilder -eq $true) {
  # mib2-mapbuilder only writes VW Discover Pro configs (1280x640 and kombi files).
  Write-Host "--> Building MapConfigs with mib2-mapbuilder";
  &npm run --silent --prefix $mapBuilder buildmaps;
  Copy-Item -Path "$mapBuilder/rendered/*" -Destination "$stagingDir/MapConfigs/" -Recurse -Force;
}

if($mapConfigs) {
  # Accept the unzipped export (which holds a MapConfigs folder) or the MapConfigs folder itself.
  $configSrc = $mapConfigs;
  if (Test-Path (Join-Path $configSrc 'MapConfigs')) { $configSrc = Join-Path $configSrc 'MapConfigs' }
  if (-not (Test-Path $configSrc)) {
    Write-Error "MapConfigs folder not found: $mapConfigs";
    exit 1;
  }
  $configSrc = (Resolve-Path $configSrc).Path;
  Write-Host "--> Using MapConfigs from $configSrc";
  $unpacked = 0;
  Get-ChildItem -Path $configSrc -Recurse -File -Include '*.mxf', '*.mxf.gz' | ForEach-Object {
    $rel = $_.FullName.Substring($configSrc.Length).TrimStart('\', '/');
    $target = Join-Path "$stagingDir/MapConfigs" $rel;
    # An unpacked .mxf replaces the stock .mxf.gz of the same name, and the other way round.
    $twin = if ($target.EndsWith('.gz')) { $target.Substring(0, $target.Length - 3) } else { "$target.gz" };
    if ((Test-Path $twin) -and -not $target.EndsWith('.gz')) { $unpacked++ }
    Remove-Item -Path $twin -ErrorAction SilentlyContinue;
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null;
    Copy-Item -Path $_.FullName -Destination $target -Force;
    Write-Host "    $rel";
  }
  if ($unpacked -gt 0) {
    Write-Warning "$unpacked unpacked .mxf files replace .mxf.gz files. Copying doesn't delete the .mxf.gz files already on the head unit; export with the original .mxf.gz names to replace them.";
  }
}

Write-host "--> Storing commit point in commit.txt";
$hash = &git rev-parse HEAD;
Set-Content -Path "$stagingDir/commit.txt" -value $hash;

Write-Host "Staging build complete";

if($deploy -eq $true) {
  Write-Host "Begin Deploy to MIB2";
  &ssh mib2 "test -d $destPath";
  if ($LASTEXITCODE -ne 0) {
    Write-Error "$destPath doesn't exist on the head unit. Run with -list to find the map style folder and pass it with -destPath.";
    exit 1;
  }
  if($backup -eq $true) {
    Write-Host "-->Performing backup";
    New-Item -ItemType Directory -Force $backupDir | Out-Null;
    &scp -r "mib2:$destPath" $backupDir;
  }
  Write-Host "-->making mount-point writable";
  &ssh mib2 mount -uw /net/mmx/mnt/app;

  write-host "--> Copying to mib2";
  # List the staged items rather than passing a wildcard, which PowerShell doesn't expand for scp.
  $items = Get-ChildItem -Path $stagingDir | ForEach-Object { $_.FullName };
  &scp -r @items "mib2:$destPath";

  write-host "--> making mount-point read-only";
  &ssh mib2 mount -ur /net/mmx/mnt/app;

  write-host "--> Restarting AppStartATF";
  &ssh mib2 slay AppStartATF;
  Write-Host "MIB Deploy complete";
}
Write-Host "Finished";
