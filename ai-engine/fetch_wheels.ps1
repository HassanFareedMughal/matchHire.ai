# fetch_wheels.ps1
# Run this on a machine that has Internet access to download wheels for offline install.
# Usage (PowerShell):
#   .\fetch_wheels.ps1 -OutDir .\wheels
param(
    [string]$OutDir = "./wheels",
    [string]$PythonCmd = "python"
)

Write-Host "Creating output directory: $OutDir"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "Downloading Python package wheels from requirements.txt..."
& $PythonCmd -m pip download -r requirements.txt -d $OutDir

if ($LASTEXITCODE -ne 0) {
    Write-Warning "pip download returned non-zero exit code. Check network/proxy settings."
}

Write-Host "Attempting to download spaCy model wheel (may not be available as a simple pip package)."
# Try common wheel/package names for the spaCy model. This may or may not succeed depending on model version.
$modelCandidates = @(
    'en_core_web_sm',
    'en-core-web-sm',
    'https://github.com/explosion/spacy-models/releases/latest/download/en_core_web_sm-3.7.0-py3-none-any.whl'
)

$downloaded = $false
foreach ($m in $modelCandidates) {
    Write-Host "Trying: $m"
    & $PythonCmd -m pip download $m -d $OutDir --no-deps
    if ($LASTEXITCODE -eq 0) { $downloaded = $true; break }
}

if (-not $downloaded) {
    Write-Warning "Could not download a spaCy model wheel automatically."
    Write-Host "Next steps:"
    Write-Host " - Run 'python -m spacy download en_core_web_sm' on this machine to install the model;"
    Write-Host "   then locate the installed package (import en_core_web_sm; print(en_core_web_sm.__file__)) and copy the package files into $OutDir as a zip or folder."
}

Write-Host "Done. Wheels saved to: $OutDir"
Write-Host "Transfer $OutDir to the offline machine and run:"
Write-Host "  pip install --no-index --find-links=./wheels -r requirements.txt"
Write-Host "If you copied the spaCy model folder, install it by copying into site-packages or by pip installing the model wheel."
