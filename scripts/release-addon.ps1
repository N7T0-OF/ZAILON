# release-addon.ps1 — prépare la publication d'un add-on officiel (spec §45).
#
# Empaquette un dossier d'add-on en `.zailon-addon`, calcule le SHA-256 et
# affiche le bloc de métadonnées à copier dans `catalog.json`.
#
# Usage :
#   .\scripts\release-addon.ps1 -AddonDir .\addon-template -Id official.zailon.frosty -Version 1.0.0 [-Repository N7T0-OF/ZAILON]
#
# Puis : tester localement (Add-ons > Importer un add-on), tag + release
# GitHub avec l'asset, signer, et passer l'entrée du catalogue à available:true.

param(
    [Parameter(Mandatory = $true)][string]$AddonDir,
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$Repository = "N7T0-OF/ZAILON"
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $AddonDir)) { throw "Dossier d'add-on introuvable : $AddonDir" }
if (-not (Test-Path (Join-Path $AddonDir 'manifest.json'))) { throw 'manifest.json introuvable dans le dossier.' }

$OutDir = Join-Path $Root 'dist'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$AssetName = "$Id-v$Version.zailon-addon"
$OutFile = Join-Path $OutDir $AssetName

Write-Host "Empaquetage : $AddonDir -> $OutFile"
Push-Location $Root
try {
    node .github/scripts/addon-cli.ts pack $AddonDir -o $OutFile
} finally {
    Pop-Location
}

$Hash = (Get-FileHash -Path $OutFile -Algorithm SHA256).Hash.ToLowerInvariant()
$Size = (Get-Item $OutFile).Length

Write-Host ''
Write-Host '=== Bloc de métadonnées catalogue (catalog.json) ==='
Write-Host '{'
Write-Host "  `"id`": `"$Id`","
Write-Host "  `"version`": `"$Version`","
Write-Host "  `"available`": true,"
Write-Host "  `"release`": {"
Write-Host "    `"repository`": `"$Repository`","
Write-Host "    `"tag`": `"$(($Id -split '\.')[-1])-v$Version`","
Write-Host "    `"asset`": `"$AssetName`""
Write-Host '  },'
Write-Host "  `"sha256`": `"$Hash`","
Write-Host "  `"size`": $Size"
Write-Host '}'
Write-Host ''
Write-Host "SHA-256 : $Hash"
Write-Host "Fichier : $OutFile"
Write-Host 'Puis : tag + release GitHub (tag explicite, jamais `latest`), signature Ed25519, et passage du catalogue à available:true (voir docs/addon-release-process.md).'
