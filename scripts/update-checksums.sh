#!/bin/bash
# Script to update checksums in README.md
# This should be run whenever the installer scripts are updated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR/install"
README="$SCRIPT_DIR/README.md"

echo "🔐 Generating checksums for installer scripts..."

# Check if required tools are installed
if ! command -v shasum &> /dev/null && ! command -v sha256sum &> /dev/null; then
    echo "❌ Error: Neither shasum nor sha256sum found. Please install one."
    exit 1
fi

if ! command -v b3sum &> /dev/null; then
    echo "⚠️  Warning: b3sum not found. Install with: cargo install b3sum"
    echo "   Continuing with SHA256 only..."
    BLAKE3_AVAILABLE=false
else
    BLAKE3_AVAILABLE=true
fi

cd "$INSTALL_DIR"

# Generate SHA256 checksums
echo "📝 Generating SHA256 checksums..."
if command -v sha256sum &> /dev/null; then
    SHA256_PY=$(sha256sum terp-installer.py | awk '{print $1}')
    SHA256_SH=$(sha256sum terp-installer.sh | awk '{print $1}')
else
    SHA256_PY=$(shasum -a 256 terp-installer.py | awk '{print $1}')
    SHA256_SH=$(shasum -a 256 terp-installer.sh | awk '{print $1}')
fi

echo "   terp-installer.py: $SHA256_PY"
echo "   terp-installer.sh: $SHA256_SH"

# Generate BLAKE3 checksums if available
if [ "$BLAKE3_AVAILABLE" = true ]; then
    echo "📝 Generating BLAKE3 checksums..."
    BLAKE3_PY=$(b3sum terp-installer.py | awk '{print $1}')
    BLAKE3_SH=$(b3sum terp-installer.sh | awk '{print $1}')
    echo "   terp-installer.py: $BLAKE3_PY"
    echo "   terp-installer.sh: $BLAKE3_SH"
fi

# Update README.md
echo "📄 Updating README.md..."

cd "$SCRIPT_DIR"

# Create temporary file with updated checksums
TEMP_FILE=$(mktemp)

# Flag to track if we're in the checksums section
IN_SHA256_SECTION=false
IN_BLAKE3_SECTION=false
SKIP_NEXT_LINE=false

while IFS= read -r line; do
    # Skip line if flagged
    if [ "$SKIP_NEXT_LINE" = true ]; then
        SKIP_NEXT_LINE=false
        continue
    fi

    # Check if we're entering SHA256 section
    if [[ "$line" == "#### SHA256 Checksums" ]]; then
        IN_SHA256_SECTION=true
        SKIP_NEXT_LINE=true  # Skip the next ``` line
        echo "$line" >> "$TEMP_FILE"
        echo '```' >> "$TEMP_FILE"
        echo "$SHA256_PY  terp-installer.py" >> "$TEMP_FILE"
        echo "$SHA256_SH  terp-installer.sh" >> "$TEMP_FILE"
        continue
    fi

    # Check if we're entering BLAKE3 section
    if [[ "$line" == "#### BLAKE3 Checksums" ]]; then
        IN_BLAKE3_SECTION=true
        SKIP_NEXT_LINE=true  # Skip the next ``` line
        echo "$line" >> "$TEMP_FILE"
        echo '```' >> "$TEMP_FILE"
        if [ "$BLAKE3_AVAILABLE" = true ]; then
            echo "$BLAKE3_PY  terp-installer.py" >> "$TEMP_FILE"
            echo "$BLAKE3_SH  terp-installer.sh" >> "$TEMP_FILE"
        else
            echo "# BLAKE3 checksums not available - install b3sum" >> "$TEMP_FILE"
        fi
        continue
    fi

    # Skip old checksum lines in SHA256 section
    if [ "$IN_SHA256_SECTION" = true ]; then
        if [[ "$line" == '```' ]]; then
            echo "$line" >> "$TEMP_FILE"
            IN_SHA256_SECTION=false
            continue
        elif [[ "$line" =~ ^[0-9a-f]{64}[[:space:]]+terp-installer\.(py|sh)$ ]]; then
            # Skip old checksum
            continue
        fi
    fi

    # Skip old checksum lines in BLAKE3 section
    if [ "$IN_BLAKE3_SECTION" = true ]; then
        if [[ "$line" == '```' ]]; then
            echo "$line" >> "$TEMP_FILE"
            IN_BLAKE3_SECTION=false
            continue
        elif [[ "$line" =~ ^[0-9a-f]{64}[[:space:]]+terp-installer\.(py|sh)$ ]] || [[ "$line" =~ ^#.*BLAKE3 ]]; then
            # Skip old checksum
            continue
        fi
    fi

    echo "$line" >> "$TEMP_FILE"
done < "$README"

# Replace original README with updated version
mv "$TEMP_FILE" "$README"

echo "✅ README.md updated successfully!"
echo ""
echo "📋 Summary:"
echo "   SHA256 checksums: ✓"
if [ "$BLAKE3_AVAILABLE" = true ]; then
    echo "   BLAKE3 checksums: ✓"
else
    echo "   BLAKE3 checksums: ⊘ (b3sum not installed)"
fi
echo ""
echo "🔄 Don't forget to:"
echo "   1. Review the changes: git diff README.md"
echo "   2. Commit the updated README: git add README.md && git commit -m 'Update installer checksums'"
echo "   3. Rebuild Docker image: docker-compose build"
