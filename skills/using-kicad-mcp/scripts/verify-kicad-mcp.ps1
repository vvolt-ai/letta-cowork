# Read-only prerequisite/build verification for Windows.
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$ServerPath = $env:KICAD_MCP_DIR
)

$Failures = 0
$Warnings = 0
function Ok([string]$Message) { Write-Host "OK    $Message" -ForegroundColor Green }
function Warn([string]$Message) { $script:Warnings++; Write-Warning $Message }
function Fail([string]$Message) { $script:Failures++; Write-Host "FAIL  $Message" -ForegroundColor Red }

if ([string]::IsNullOrWhiteSpace($ServerPath)) {
    Write-Error "Pass -ServerPath or set KICAD_MCP_DIR."
    exit 2
}
if (-not (Test-Path -LiteralPath $ServerPath -PathType Container)) {
    Write-Error "Server directory does not exist: $ServerPath"
    exit 1
}
$ServerPath = (Resolve-Path -LiteralPath $ServerPath).Path
Write-Host "KiCad MCP verification (read-only)`nServer: $ServerPath`n"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodeVersion = (& node -p "process.versions.node" 2>$null).Trim()
    $nodeMajor = 0
    if ($nodeVersion -match '^(\d+)\.') { $nodeMajor = [int]$Matches[1] }
    if ($nodeMajor -ge 18) { Ok "Node.js $nodeVersion (>=18)" }
    else { Fail "Node.js 18+ required; found $nodeVersion" }
} else { Fail "node not found in PATH" }

$npmCommand = Get-Command npm -ErrorAction SilentlyContinue
if ($npmCommand) { Ok "npm $((& npm --version 2>$null).Trim())" }
else { Fail "npm not found in PATH" }

if (Get-Command git -ErrorAction SilentlyContinue) { Ok "git available" }
else { Fail "git not found in PATH" }

foreach ($item in @('package.json', 'requirements.txt', 'src', 'python')) {
    $itemPath = Join-Path $ServerPath $item
    if (Test-Path -LiteralPath $itemPath) { Ok "Found $item" }
    else { Fail "Missing expected repository item: $item" }
}

if (Test-Path -LiteralPath (Join-Path $ServerPath 'node_modules') -PathType Container) {
    Ok "Node dependencies installed"
} else { Fail "node_modules missing; run npm install in the server directory" }

$distPath = Join-Path $ServerPath 'dist\index.js'
if (Test-Path -LiteralPath $distPath -PathType Leaf) {
    Ok "Build artifact found: dist/index.js"
    if ($nodeCommand) {
        & node --check $distPath *> $null
        if ($LASTEXITCODE -eq 0) { Ok "Build artifact passes Node syntax check" }
        else { Fail "dist/index.js failed Node syntax check" }
    }
} else { Fail "dist/index.js missing; run npm run build" }

$pythonPath = $env:KICAD_PYTHON
if ([string]::IsNullOrWhiteSpace($pythonPath)) {
    $candidates = @()
    foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($root) {
            $candidates += Get-ChildItem -Path (Join-Path $root 'KiCad') -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { Join-Path $_.FullName 'bin\python.exe' }
        }
    }
    $pythonPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}

if ($pythonPath -and (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    $pythonVersion = (& $pythonPath -c "import platform; print(platform.python_version())" 2>$null).Trim()
    Ok "Python available: $pythonVersion ($pythonPath)"
    $pcbnewResult = & $pythonPath -c "import pcbnew; print(pcbnew.GetBuildVersion() if hasattr(pcbnew, 'GetBuildVersion') else 'imported')" 2>&1
    if ($LASTEXITCODE -eq 0) { Ok "pcbnew import succeeded: $pcbnewResult" }
    else { Fail "pcbnew import failed with $pythonPath`: $pcbnewResult" }
} else { Fail "KiCad Python not found; set KICAD_PYTHON to its executable" }

$kicadCli = Get-Command kicad-cli -ErrorAction SilentlyContinue
if ($kicadCli) {
    $kicadVersion = (& kicad-cli version 2>$null).Trim()
    $kicadMajor = 0
    if ($kicadVersion -match '^(\d+)\.') { $kicadMajor = [int]$Matches[1] }
    if ($kicadMajor -ge 9) { Ok "KiCad CLI $kicadVersion" }
    else { Warn "KiCad CLI version could not be confirmed as 9+: $kicadVersion" }
} else { Warn "kicad-cli not found in PATH; bundled Python check is authoritative on some installs" }

Write-Host "`nResult: $Failures failure(s), $Warnings warning(s)"
if ($Failures -gt 0) { exit 1 }
exit 0
