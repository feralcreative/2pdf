#!/bin/bash
# Installation script for md-to-pdf
# This script helps you install md-to-pdf in other projects

echo "📦 md-to-pdf Installation Helper"
echo "================================"

# Check if we're in the md-to-pdf directory
if [ ! -f "md-to-pdf.sh" ]; then
    echo "❌ Error: This script must be run from the md-to-pdf directory"
    echo "💡 Make sure you're in the directory containing md-to-pdf.sh"
    exit 1
fi

# Get target directory from user
if [ -z "$1" ]; then
    echo "📁 Enter the target project directory (or press Enter for current directory):"
    read -r TARGET_DIR
    if [ -z "$TARGET_DIR" ]; then
        TARGET_DIR="."
    fi
else
    TARGET_DIR="$1"
fi

# Resolve absolute path
TARGET_DIR=$(cd "$TARGET_DIR" 2>/dev/null && pwd)
if [ $? -ne 0 ]; then
    echo "❌ Error: Target directory '$1' does not exist"
    exit 1
fi

echo "🎯 Target directory: $TARGET_DIR"

# Check if md-to-pdf already exists in target
if [ -d "$TARGET_DIR/md-to-pdf" ]; then
    echo "⚠️  md-to-pdf directory already exists in target"
    echo "🤔 Do you want to overwrite it? (y/N):"
    read -r OVERWRITE
    if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
        echo "❌ Installation cancelled"
        exit 1
    fi
    rm -rf "$TARGET_DIR/md-to-pdf"
fi

# Copy the md-to-pdf directory
echo "📋 Copying md-to-pdf to target directory..."
cp -r "$(pwd)" "$TARGET_DIR/md-to-pdf"

# Remove the test files from the copy
rm -f "$TARGET_DIR/md-to-pdf/test.md"
rm -f "$TARGET_DIR/md-to-pdf/test.pdf"
rm -f "$TARGET_DIR/md-to-pdf/README.pdf"

# Make sure the script is executable
chmod +x "$TARGET_DIR/md-to-pdf/md-to-pdf.sh"

echo "✅ Installation complete!"
echo ""
echo "📖 Usage in your project:"
echo "   cd $TARGET_DIR"
echo "   ./md-to-pdf/md-to-pdf.sh              # Convert README.md"
echo "   ./md-to-pdf/md-to-pdf.sh myfile.md    # Convert custom file"
echo ""
echo "📚 Documentation: $TARGET_DIR/md-to-pdf/README.md"
echo ""
echo "🎉 Happy PDF generating!"
