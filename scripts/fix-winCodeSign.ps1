# PowerShell script to fix winCodeSign extraction issue
# This script extracts the winCodeSign archive without creating symbolic links

$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$sevenZipPath = "E:\New folder\smart-browser\node_modules\.pnpm\7zip-bin@5.2.0\node_modules\7zip-bin\win\x64\7za.exe"

Write-Host "Checking for winCodeSign cache directory..."

if (Test-Path $cacheDir) {
    Write-Host "Found cache directory: $cacheDir"
    
    # Find all .7z files in subdirectories
    $archives = Get-ChildItem -Path $cacheDir -Recurse -Filter "*.7z" | Where-Object { $_.Directory.Name -match '^\d+$' }
    
    foreach ($archive in $archives) {
        $extractDir = $archive.DirectoryName
        Write-Host "Extracting: $($archive.FullName) to $extractDir"
        
        # Extract without symbolic links (use -snl to skip links)
        & $sevenZipPath x "-snl" "-bd" "-o$extractDir" $archive.FullName
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Successfully extracted: $($archive.Name)"
        } else {
            Write-Host "Warning: Extraction had issues for $($archive.Name), but continuing..."
        }
    }
    
    Write-Host "Done! You can now try building again."
} else {
    Write-Host "Cache directory not found. This is normal if you haven't run the build yet."
}



