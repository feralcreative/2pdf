#!/bin/bash
# Markdown to PDF converter with image support and no headers/footers
# Portable script that works from any project - always processes README.md in current directory
# 
# Usage: ./md-to-pdf.sh [markdown-file]
# If no file specified, defaults to README.md in current directory
#
# Dependencies:
# - pandoc (auto-installed via brew on macOS)
# - Google Chrome or Chromium browser
#
# Features:
# - Beautiful styling with Inter font
# - Image support (converts SVG to PNG when available)
# - No headers/footers in PDF output
# - Automatic page break support
# - Icon processing for complex HTML elements
# - Print-optimized layout

# Get the current working directory (where the script is run from)
CURRENT_DIR="$(pwd)"

# Default to README.md if no argument provided
MARKDOWN_FILE="${1:-README.md}"

echo "🔄 Converting $MARKDOWN_FILE to beautiful PDF..."
echo "📁 Working directory: $CURRENT_DIR"

# Check if markdown file exists in current directory
if [ ! -f "$MARKDOWN_FILE" ]; then
    echo "❌ $MARKDOWN_FILE not found in current directory: $CURRENT_DIR"
    echo "💡 Make sure you have a $MARKDOWN_FILE file in your current directory"
    echo "💡 Or specify a different markdown file: ./md-to-pdf.sh myfile.md"
    exit 1
fi

# Check if pandoc is available
if ! command -v pandoc &> /dev/null; then
    echo "📦 Installing Pandoc..."
    if command -v brew &> /dev/null; then
        brew install pandoc
    else
        echo "❌ Please install Pandoc manually: https://pandoc.org/"
        exit 1
    fi
fi

# Process PDF-only content first - extract and convert to HTML
echo "🏷️ Processing PDF-only content tags..."

# Extract PDF-ONLY content and process it as Markdown
perl -0pe 's/<!--\s*PDF\s+ONLY\s*\n(.*?)\n-->/PDFONLY_PLACEHOLDER_START\n\1\nPDFONLY_PLACEHOLDER_END/gs; s/<!--\s*PDF-ONLY\s*\n(.*?)\n-->/PDFONLY_PLACEHOLDER_START\n\1\nPDFONLY_PLACEHOLDER_END/gs' "$MARKDOWN_FILE" > /tmp/md_with_placeholders.md

# Convert the entire file to HTML (including PDF-ONLY content)
echo "📝 Converting markdown to HTML..."
pandoc /tmp/md_with_placeholders.md -t html --no-highlight > /tmp/md_base.html

# Clean up the placeholder markers
sed 's/PDFONLY_PLACEHOLDER_START//g; s/PDFONLY_PLACEHOLDER_END//g' /tmp/md_base.html > /tmp/md_processed.html
mv /tmp/md_processed.html /tmp/md_base.html

# Create beautiful styled HTML with image support
echo "🎨 Creating styled HTML with image support..."
cat > /tmp/md_styled.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Markdown to PDF</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        @page {
            margin: 0.5in;
            size: letter;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        /* Hide any potential headers/footers */
        .header, .footer, header, footer {
            display: none !important;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            font-size: 14px;
            background: white;
            padding: 25px;
            max-width: 800px;
            margin: 0 auto;
            text-align: left;
        }
        
        h1 {
            font-size: 32px;
            font-weight: 700;
            color: #880088;
            margin: 0 0 20px 0;
            border-bottom: 1px solid #880088;
            padding-bottom: 5px;
        }

        h2 {
            font-size: 26px;
            font-weight: 600;
            color: #222;
            margin: 37px 0 15px 0;
            border-bottom: 1px solid #e1e5e9;
            padding-bottom: 4px;
        }

        h3 {
            font-size: 21px;
            font-weight: 600;
            color: #333;
            margin: 30px 0 6px 0;
        }

        h4 {
            font-size: 18px;
            font-weight: 500;
            color: #444;
            margin: 13px 0 2px 0;
        }

        h5, h6 {
            font-size: 16px;
            font-weight: 500;
            color: #555;
            margin: 24px 0 4px 0;
        }

        p {
            margin: 10px 0;
            text-align: left;
        }
        
        ul, ol {
            margin: 8px 0 8px 25px;
        }

        li {
            margin: 2px 0;
        }
        
        code {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 2px 4px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 11px;
            font-weight: 600;
            color: #d73a49;
        }

        pre {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
            overflow-x: auto;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 11px;
            font-weight: 600;
            line-height: 1.5;
        }
        
        pre code {
            background: none;
            border: none;
            padding: 0;
            color: #24292e;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 18px 0;
            font-size: 13px;
            background: white;
            border: 1px solid #ddd;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            table-layout: fixed;
        }

        th {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            font-weight: 600;
            padding: 1px 12px;
            text-align: left;
            border: 1px solid #ddd;
            color: #333;
            vertical-align: middle;
        }

        td {
            padding: 1px 12px;
            border: 1px solid #ddd;
            vertical-align: middle;
        }

        tr:nth-child(even) {
            background: #fafbfc;
        }

        /* Fixed column widths for consistent layout */
        td:nth-child(1), th:nth-child(1) {
            width: 80px !important;
            min-width: 80px !important;
            max-width: 80px !important;
            text-align: center !important;
            vertical-align: middle !important;
        }

        /* Large font size only for icon cells, not headers */
        td:nth-child(1) {
            font-size: 24px;
        }

        td:nth-child(2), th:nth-child(2) {
            width: 200px !important;
            min-width: 200px !important;
            max-width: 200px !important;
            font-weight: 600;
        }

        td:nth-child(3), th:nth-child(3) {
            width: 400px !important;
            min-width: 400px !important;
            max-width: 400px !important;
        }

        /* Force table to respect column widths */
        table col:nth-child(1) { width: 80px !important; }
        table col:nth-child(2) { width: 200px !important; }
        table col:nth-child(3) { width: 400px !important; }

        /* Manual page break support */
        .page-break {
            page-break-before: always !important;
            break-before: page !important;
            height: 0;
            margin: 0;
            padding: 0;
            border: none;
            visibility: hidden;
        }

        /* Convert complex HTML icons to simple colored squares */
        .icon-placeholder {
            display: inline-block;
            width: 20px;
            height: 20px;
            border-radius: 3px;
            margin: 2px;
        }

        .icon-5g { background-color: #006400; }
        .icon-1gig { background-color: #ff8c00; }
        .icon-10gig { background-color: #cc4400; }
        .icon-sonic { background-color: #27aae1; }
        
        blockquote {
            border-left: 4px solid #880088;
            background: #F2E6F2;
            margin: 16px 0;
            padding: 12px 20px;
            font-style: italic;
            color: #555;
            border-radius: 0 4px 4px 0;
        }
        
        a {
            color: #880088;
            text-decoration: none;
            font-weight: 600;
        }
        
        /* Image styling */
        img {
            max-width: 100%;
            height: auto;
            display: inline-block;
            vertical-align: middle;
            border-radius: 4px;
        }

        /* Make table icons 25% smaller */
        table img {
            width: 75% !important;
            height: 75% !important;
            max-width: 19px;
            max-height: 19px;
        }
        
        /* SVG icon styling */
        img[src$=".svg"] {
            width: 25px;
            height: 25px;
            display: inline-block;
            vertical-align: middle;
        }
        
        /* Emoji support */
        h1, h2, h3, h4, h5, h6, p, li, td, th {
            font-family: 'Inter', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
        }

        /* Print optimizations */
        @media print {
            body {
                font-size: 12px;
                padding: 15px;
            }

            h1 { font-size: 26px; margin: 0 0 15px 0; }
            h2 { font-size: 22px; margin: 30px 0 12px 0; color: #222; }
            h3 { font-size: 17px; margin: 24px 0 5px 0; color: #333; }
            h4 { font-size: 16px; margin: 10px 0 2px 0; color: #444; }
            h5, h6 { font-size: 14px; margin: 16px 0 3px 0; color: #555; }

            table {
                font-size: 11px;
                margin: 12px 0;
            }

            th, td {
                padding: 1px 8px;
            }

            ul, ol {
                margin: 6px 0 6px 20px;
            }

            li {
                margin: 1px 0;
            }

            img[src$=".svg"] {
                width: 20px;
                height: 20px;
            }
        }
    </style>
</head>
<body>
EOF

# Replace SVG icons with PNG versions using absolute file paths
echo "🖼️ Processing icons - replacing SVGs with PNGs..."
cp /tmp/md_base.html /tmp/md_temp.html

# Replace SVG references with PNG versions using absolute paths
if [ -d "img/icons" ]; then
    for svg_file in img/icons/*.svg; do
        if [ -f "$svg_file" ]; then
            svg_filename=$(basename "$svg_file")
            png_filename="${svg_filename%.svg}.png"
            png_file="img/icons/$png_filename"

            # Check if PNG version exists
            if [ -f "$png_file" ]; then
                # Replace the SVG src path with absolute PNG path
                sed -i '' "s|src=\"img/icons/$svg_filename\"|src=\"file://$(pwd)/$png_file\"|g" /tmp/md_temp.html
                echo "   🖼️ Using PNG: $png_filename (replacing $svg_filename)"
            else
                echo "   ⚠️ PNG not found for: $svg_filename, keeping SVG"
                # Keep original SVG with absolute path
                sed -i '' "s|src=\"img/icons/$svg_filename\"|src=\"file://$(pwd)/img/icons/$svg_filename\"|g" /tmp/md_temp.html
            fi
        fi
    done
fi

# Handle any remaining image paths with absolute file:// URLs
sed 's|src="img/|src="file://'$(pwd)'/img/|g' /tmp/md_temp.html >> /tmp/md_styled.html

# Add JavaScript to process icons and close HTML
cat >> /tmp/md_styled.html << 'EOF'
<script>
// Convert complex HTML div icons to simple colored squares
(function() {
    // Add column groups to enforce widths immediately
    document.querySelectorAll('table').forEach(table => {
        if (!table.querySelector('colgroup')) {
            const colgroup = document.createElement('colgroup');
            colgroup.innerHTML = '<col style="width: 80px !important;"><col style="width: 200px !important;"><col style="width: 400px !important;">';
            table.insertBefore(colgroup, table.firstChild);
        }

        // Also add inline styles directly to cells
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td, th');
            if (cells[0]) cells[0].style.cssText = 'width: 80px !important; min-width: 80px !important; max-width: 80px !important; text-align: center !important;';
            if (cells[1]) cells[1].style.cssText = 'width: 200px !important; min-width: 200px !important; max-width: 200px !important; font-weight: 600;';
            if (cells[2]) cells[2].style.cssText = 'width: 400px !important; min-width: 400px !important; max-width: 400px !important;';
        });
    });
    // Handle complex clip-path icons
    document.querySelectorAll('div[style*="clip-path"]').forEach(iconDiv => {
        const style = iconDiv.getAttribute('style') || '';
        let iconClass = '';

        // Determine icon type based on background color
        if (style.includes('#006400')) {
            iconClass = 'icon-5g';
        } else if (style.includes('#ff8c00')) {
            iconClass = 'icon-1gig';
        } else if (style.includes('#cc4400')) {
            iconClass = 'icon-10gig';
        } else if (style.includes('#27aae1')) {
            iconClass = 'icon-sonic';
        }

        if (iconClass) {
            // Replace the complex div with a simple colored square
            const placeholder = document.createElement('div');
            placeholder.className = 'icon-placeholder ' + iconClass;
            iconDiv.parentNode.replaceChild(placeholder, iconDiv);
        }
    });

    // Also handle nested icon divs (like Sonic.net which has multiple layers)
    document.querySelectorAll('div[style*="background-color"][style*="clip-path"]').forEach(iconDiv => {
        const parentDiv = iconDiv.closest('div[style*="width: 16px"]');
        if (parentDiv && !parentDiv.querySelector('.icon-placeholder')) {
            const style = parentDiv.getAttribute('style') || iconDiv.getAttribute('style') || '';
            let iconClass = '';

            if (style.includes('#27aae1') || iconDiv.getAttribute('style').includes('#27aae1')) {
                iconClass = 'icon-sonic';
            } else if (style.includes('#006400')) {
                iconClass = 'icon-5g';
            } else if (style.includes('#ff8c00')) {
                iconClass = 'icon-1gig';
            } else if (style.includes('#cc4400')) {
                iconClass = 'icon-10gig';
            }

            if (iconClass) {
                const placeholder = document.createElement('div');
                placeholder.className = 'icon-placeholder ' + iconClass;
                parentDiv.parentNode.replaceChild(placeholder, parentDiv);
            }
        }
    });

    // Convert manual page break comments to actual page breaks
    // Look for <!-- PAGE-BREAK --> comments in the HTML
    let htmlContent = document.documentElement.outerHTML;
    const pageBreakRegex = /<!--\s*PAGE-?BREAK\s*-->/gi;

    if (pageBreakRegex.test(htmlContent)) {
        // Replace page break comments with div elements that trigger page breaks
        htmlContent = htmlContent.replace(
            pageBreakRegex,
            '<div class="page-break"></div>'
        );
        console.log('Manual page breaks processed');
    }

    // Process PDF-only content tags (already processed by shell script, but clean up any remaining placeholders)
    const pdfOnlyPlaceholderStart = /PDFONLY_PLACEHOLDER_START/gi;
    const pdfOnlyPlaceholderEnd = /PDFONLY_PLACEHOLDER_END/gi;

    if (pdfOnlyPlaceholderStart.test(htmlContent) || pdfOnlyPlaceholderEnd.test(htmlContent)) {
        htmlContent = htmlContent.replace(pdfOnlyPlaceholderStart, '');
        htmlContent = htmlContent.replace(pdfOnlyPlaceholderEnd, '');
        console.log('PDF-only placeholder tags cleaned up');
    }

    // Apply all HTML changes at once
    if (htmlContent !== document.documentElement.outerHTML) {
        document.documentElement.innerHTML = htmlContent;
    }
})();
</script>
</body>
</html>
EOF

# Find Chrome
CHROME_PATH=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    if [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
        CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    elif [ -f "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
        CHROME_PATH="/Applications/Chromium.app/Contents/MacOS/Chromium"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if command -v google-chrome &> /dev/null; then
        CHROME_PATH="google-chrome"
    elif command -v chromium-browser &> /dev/null; then
        CHROME_PATH="chromium-browser"
    elif command -v chromium &> /dev/null; then
        CHROME_PATH="chromium"
    fi
fi

if [ -z "$CHROME_PATH" ]; then
    echo "❌ Chrome not found. Please install Google Chrome."
    exit 1
fi

# Generate output filename based on input filename
OUTPUT_FILE="${MARKDOWN_FILE%.*}.pdf"

# Convert to PDF with no headers/footers
echo "📄 Converting to PDF (no headers/footers)..."
"$CHROME_PATH" \
    --headless \
    --disable-gpu \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-web-security \
    --allow-file-access-from-files \
    --disable-logging \
    --log-level=3 \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --disable-features=TranslateUI,VizDisplayCompositor \
    --disable-component-extensions-with-background-pages \
    --print-to-pdf="$OUTPUT_FILE" \
    --print-to-pdf-no-header \
    --no-pdf-header-footer \
    --disable-pdf-tagging \
    --virtual-time-budget=10000 \
    --run-all-compositor-stages-before-draw \
    "file:///tmp/md_styled.html" 2>/dev/null

# Debug: Keep the HTML file for inspection
echo "🔍 Debug: HTML file saved as /tmp/md_styled.html for inspection"

# Clean up (but keep the styled HTML for debugging)
rm -f /tmp/md_base.html /tmp/md_temp.html

# Check result
if [ -f "$OUTPUT_FILE" ]; then
    echo "✅ Successfully created $OUTPUT_FILE"
    echo "📊 File size: $(du -h "$OUTPUT_FILE" | cut -f1)"
    echo "📁 Location: $(pwd)/$OUTPUT_FILE"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "🔍 Opening PDF..."
        open "$OUTPUT_FILE"
    fi
else
    echo "❌ PDF generation failed"
fi

echo "🎉 Done!"
