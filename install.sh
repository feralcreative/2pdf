#!/bin/bash
# Installation script for md2pdf
# This script helps you install md2pdf in other projects

echo "📦 md2pdf Installation Helper"
echo "================================"

# Check if we're in the md2pdf directory
if [ ! -f "md2pdf.sh" ]; then
    echo "❌ Error: This script must be run from the md2pdf directory"
    echo "💡 Make sure you're in the directory containing md2pdf.sh"
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

# Check if md2pdf already exists in target
if [ -d "$TARGET_DIR/md2pdf" ]; then
    echo "⚠️  md2pdf directory already exists in target"
    echo "🤔 Do you want to overwrite it? (y/N):"
    read -r OVERWRITE
    if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
        echo "❌ Installation cancelled"
        exit 1
    fi
    rm -rf "$TARGET_DIR/md2pdf"
fi

# Copy the md2pdf directory
echo "📋 Copying md2pdf to target directory..."
cp -r "$(pwd)" "$TARGET_DIR/md2pdf"

# Remove the test files from the copy
rm -f "$TARGET_DIR/md2pdf/test.md"
rm -f "$TARGET_DIR/md2pdf/test.pdf"
rm -f "$TARGET_DIR/md2pdf/README.pdf"

# Make sure the script is executable
chmod +x "$TARGET_DIR/md2pdf/md2pdf.sh"

echo "✅ Installation complete!"
echo ""
echo "📖 Usage in your project:"
echo "   cd $TARGET_DIR"
echo "   ./md2pdf/md2pdf.sh              # Convert README.md"
echo "   ./md2pdf/md2pdf.sh myfile.md    # Convert custom file"
echo ""
echo "📚 Documentation: $TARGET_DIR/md2pdf/README.md"
echo ""
echo "🎉 Happy PDF generating!"
