# Building on Windows - Fixing winCodeSign Symbolic Link Issue

## Problem
When building on Windows, electron-builder tries to extract `winCodeSign` which contains symbolic links. Windows requires administrator privileges to create symbolic links, causing the build to fail.

## Solutions (Choose One)

### Option 1: Enable Developer Mode (Recommended - No Admin Required)
1. Open **Settings** (Windows Key + I)
2. Go to **Update & Security** → **For developers**
3. Enable **Developer Mode**
4. Restart your terminal
5. Run `pnpm run build:win` again

### Option 2: Run Terminal as Administrator
1. Close your current terminal
2. Right-click on **Git Bash** (or your terminal)
3. Select **Run as administrator**
4. Navigate to your project directory
5. Run `pnpm run build:win`

### Option 3: Clear Cache and Retry
If the cache is corrupted, clear it first:
```bash
# In PowerShell (Run as Administrator)
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -ErrorAction SilentlyContinue

# Then try building again
pnpm run build:win
```

### Option 4: Use the Fix Script
Run the PowerShell fix script before building:
```bash
# In PowerShell (Run as Administrator)
powershell -ExecutionPolicy Bypass -File scripts/fix-winCodeSign.ps1

# Then build
pnpm run build:win
```

## Why This Happens
Electron-builder downloads `winCodeSign` for ASAR integrity checking. The archive contains macOS symbolic links (`darwin/10.12/lib/*.dylib`) which Windows cannot extract without special privileges.

## Configuration Applied
The following configurations have been applied to skip code signing:
- `signAndEditExecutable: false`
- `signingHashAlgorithms: []`
- `CSC_IDENTITY_AUTO_DISCOVERY=false`

However, electron-builder still needs winCodeSign for ASAR integrity, which is why we need one of the solutions above.



