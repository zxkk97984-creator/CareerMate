$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
    $supported = $false
    if ((Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        $installedVersion = & node --version
        $supported = $LASTEXITCODE -eq 0 -and $installedVersion -match '^v(22|24)\.'
    }
    if (-not $supported) {
        $version = 'v22.23.3'
        $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
        $name = "node-$version-win-$arch"
        $runtime = Join-Path (Get-Location) '.runtime'
        $nodeDir = Join-Path $runtime $name
        if (-not (Test-Path (Join-Path $nodeDir 'node.exe'))) {
            New-Item -ItemType Directory -Force -Path $runtime | Out-Null
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $zip = Join-Path $runtime "$name.zip"
            Write-Host "Downloading Node.js $version from nodejs.org..."
            Invoke-WebRequest "https://nodejs.org/dist/$version/$name.zip" -OutFile $zip -UseBasicParsing
            $sums = (Invoke-WebRequest "https://nodejs.org/dist/$version/SHASUMS256.txt" -UseBasicParsing).Content
            $line = ($sums -split "`n" | Where-Object { $_.Trim().EndsWith("  $name.zip") })
            if (-not $line) { throw 'No checksum found for the Node.js download.' }
            $expected = ($line.Trim() -split '\s+')[0]
            if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node.js checksum mismatch; download rejected.' }
            Expand-Archive -Path $zip -DestinationPath $runtime -Force
            Remove-Item $zip
        }
        $env:PATH = "$nodeDir;$env:PATH"
    }
    & node (Join-Path $PSScriptRoot 'launch-review.mjs') @args
    exit $LASTEXITCODE
} catch {
    Write-Host "CareerMate startup failed: $($_.Exception.Message)"
    exit 1
}
