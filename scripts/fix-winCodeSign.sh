#!/bin/bash
# Bash script to fix winCodeSign extraction issue on Windows (Git Bash)
# This script attempts to extract winCodeSign archives without symlinks

CACHE_DIR="$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
SEVENZIP_PATH="E:/New folder/smart-browser/node_modules/.pnpm/7zip-bin@5.2.0/node_modules/7zip-bin/win/x64/7za.exe"

echo "Checking for winCodeSign cache directory..."

if [ -d "$CACHE_DIR" ]; then
    echo "Found cache directory: $CACHE_DIR"
    
    # Find all .7z files in numbered subdirectories
    find "$CACHE_DIR" -type f -name "*.7z" -path "*/[0-9]*/*" | while read -r archive; do
        extract_dir=$(dirname "$archive")
        echo "Extracting: $archive to $extract_dir"
        
        # Extract without symbolic links (use -snl to skip links instead of -snld)
        # Note: This might still fail, but it's worth trying
        "$SEVENZIP_PATH" x -snl -bd "-o$extract_dir" "$archive" 2>&1 || echo "Warning: Extraction had issues, but continuing..."
    done
    
    echo "Done! You can now try building again."
else
    echo "Cache directory not found. This is normal if you haven't run the build yet."
fi



