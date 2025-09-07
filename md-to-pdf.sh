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
# - Beautiful styling with Lato font
# - Image support (converts SVG to PNG when available)
# - No headers/footers in PDF output
# - Automatic page break support
# - Icon processing for complex HTML elements
# - Print-optimized layout

# Get the current working directory (where the script is run from)
CURRENT_DIR="$(pwd)"

# Get the directory where the script is located (for finding assets like CSS and fonts)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# Use the minimized CSS file compiled by IDE (from script directory)
CSS_FILE="$SCRIPT_DIR/style/pdf.min.css"

if [ -f "$CSS_FILE" ]; then
    echo "🎨 Using minimized CSS from IDE compilation..."

    # Create a temporary directory for fonts and copy them there
    TEMP_FONTS_DIR="/tmp/md_to_pdf_fonts"
    mkdir -p "$TEMP_FONTS_DIR"
    cp -r "$SCRIPT_DIR/fonts/Lato" "$TEMP_FONTS_DIR/"

    # Replace relative font paths with absolute file:// URLs for Chrome
    sed "s|url(\"../fonts/|url(\"file://$TEMP_FONTS_DIR/|g" "$CSS_FILE" > /tmp/pdf_absolute.css
    CSS_FILE="/tmp/pdf_absolute.css"

    # Debug: Show font paths being used
    echo "🔍 Font paths in CSS:"
    grep -o "file://[^)]*\.\(woff2\|woff\|ttf\)" "$CSS_FILE" | head -5

    # Debug: Verify font files exist
    echo "🔍 Checking font files:"
    ls -la "$TEMP_FONTS_DIR/Lato/ttf/lato-regular.ttf" 2>/dev/null && echo "✅ lato-regular.ttf found" || echo "❌ lato-regular.ttf missing"
    ls -la "$TEMP_FONTS_DIR/Lato/ttf/lato-bold.ttf" 2>/dev/null && echo "✅ lato-bold.ttf found" || echo "❌ lato-bold.ttf missing"
    ls -la "$TEMP_FONTS_DIR/Lato/woff2/lato-regular.woff2" 2>/dev/null && echo "✅ lato-regular.woff2 found" || echo "❌ lato-regular.woff2 missing"
else
    echo "❌ Minimized CSS file not found: $CSS_FILE"
    echo "💡 Make sure your IDE has compiled pdf.scss to pdf.min.css"
    exit 1
fi

# Create beautiful styled HTML with external CSS
echo "🎨 Creating styled HTML with minimized CSS..."
cat > /tmp/md_styled.html << EOF
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Markdown to PDF</title>
    <style>
$(cat "$CSS_FILE")
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

# Process col-widths comments before adding to styled HTML
echo "🔧 Processing column width comments..."
cp /tmp/md_temp.html /tmp/md_colwidths.html

# Use Node.js to process col-widths comments
node -e "
const fs = require('fs');
let html = fs.readFileSync('/tmp/md_colwidths.html', 'utf8');

const colWidthRegex = /<!--[!~][^>]*col-widths:\s*([^>]+?)-->\s*<table[^>]*>/gis;
let match;
let processedCount = 0;

while ((match = colWidthRegex.exec(html)) !== null) {
    const widthsString = match[1].trim();
    const widths = widthsString.split(',').map(w => w.trim());

    // Create a unique table ID
    const tableId = \`table-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`;

    // Find the full table (comment + table)
    const commentStart = match.index;
    // Find where the table tag starts in the match
    const tableTagMatch = match[0].match(/<table[^>]*>/i);
    const tableTagLength = tableTagMatch ? tableTagMatch[0].length : 7;
    const tableStart = match.index + match[0].length - tableTagLength;
    const tableHTML = html.substring(tableStart);
    const tableEndMatch = tableHTML.match(/<\/table>/i);

    if (tableEndMatch) {
        const fullTable = tableHTML.substring(0, tableEndMatch.index + 8);
        const commentAndTable = html.substring(commentStart, tableStart + tableEndMatch.index + 8);

        // Create a completely new table with explicit width attributes
        let styledTable = fullTable.replace(/<colgroup>[\s\S]*?<\/colgroup>/i, '');

        // Replace table tag with fixed layout and explicit colgroup
        let colgroup = '<colgroup>';
        widths.forEach((width) => {
            colgroup += \`<col style=\"width: \${width} !important;\">\`;
        });
        colgroup += '</colgroup>';

        styledTable = styledTable.replace(
            /<table[^>]*>/i,
            \`<table style=\"table-layout: fixed; width: 100%; border-collapse: collapse;\">\${colgroup}\`
        );

        // Replace the entire comment + table with styled version
        html = html.replace(commentAndTable, styledTable);
        processedCount++;

        console.log(\`   ✅ Applied column widths [\${widthsString}] to table (using width attributes)\`);
        console.log(\`   🔍 Generated colgroup: \${colgroup}\`);
    }
}

if (processedCount === 0) {
    console.log('   ℹ️ No col-widths comments found');
}

fs.writeFileSync('/tmp/md_colwidths.html', html);
"

# Handle any remaining image paths with absolute file:// URLs
sed 's|src="img/|src="file://'$(pwd)'/img/|g' /tmp/md_colwidths.html >> /tmp/md_styled.html

# Add JavaScript to process icons and force fonts
cat >> /tmp/md_styled.html << 'EOF'
<script>
// Force Lato font on all elements (JavaScript nuclear option)
function forceLato() {
    console.log('🔤 Forcing Lato font on all elements...');
    const elements = document.querySelectorAll('*:not(code):not(pre)');
    elements.forEach(el => {
        el.style.setProperty('font-family', '"Lato", "Helvetica Neue", Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif', '!important');
    });

    // Special handling for paragraphs and lists
    const textElements = document.querySelectorAll('p, li, div, span, h1, h2, h3, h4, h5, h6, ul, ol');
    textElements.forEach(el => {
        el.style.setProperty('font-family', '"Lato", "Helvetica Neue", Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif', '!important');
    });

    console.log(`🔤 Applied Lato to ${elements.length} elements`);
}

// Convert complex HTML div icons to simple colored squares
(function() {
    // Add column groups to enforce widths immediately
    document.querySelectorAll('table').forEach(table => {
        // Check if this is the z-index reference table
        const isZIndexTable = table.querySelector('th') &&
            Array.from(table.querySelectorAll('th')).some(th =>
                th.textContent.includes('Z-Index') || th.textContent.includes('Element') || th.textContent.includes('Purpose')
            );



        if (isZIndexTable) {
            // Z-index table - replace existing colgroup or create new one
            const existingColgroup = table.querySelector('colgroup');
            if (existingColgroup) {
                existingColgroup.remove();
            }

            const colgroup = document.createElement('colgroup');
            colgroup.innerHTML = '<col><col><col><col>'; // No fixed widths
            table.insertBefore(colgroup, table.firstChild);

            // Add z-index-table class for CSS targeting
            table.classList.add('z-index-table');
            // Make text smaller
            table.style.fontSize = '0.75em';
            // Set table layout to auto for content-based sizing
            table.style.tableLayout = 'auto';
        } else if (!table.querySelector('colgroup')) {
            // Default table widths for non-z-index tables
            const colgroup = document.createElement('colgroup');
            colgroup.innerHTML = '<col style="width: 80px !important;"><col style="width: 200px !important;"><col style="width: 400px !important;">';
            table.insertBefore(colgroup, table.firstChild);
        }

        // Only add inline styles for non-z-index tables
        if (!isZIndexTable) {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                // Default table cell styling
                if (cells[0]) cells[0].style.cssText = 'width: 80px !important; min-width: 80px !important; max-width: 80px !important; text-align: center !important;';
                if (cells[1]) cells[1].style.cssText = 'width: 200px !important; min-width: 200px !important; max-width: 200px !important; font-weight: 600;';
                if (cells[2]) cells[2].style.cssText = 'width: 400px !important; min-width: 400px !important; max-width: 400px !important;';
            });
        }
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
    // Look for <!-- PAGE-BREAK --> comments in the HTML (supports Better Comments plugin tags)
    let htmlContent = document.documentElement.outerHTML;
    const pageBreakRegex = /<!--[!?~\/\\*|—\^\^@#\[\s]*PAGE-?BREAK\s*-->/gi;

    if (pageBreakRegex.test(htmlContent)) {
        // Replace page break comments with div elements that trigger page breaks
        htmlContent = htmlContent.replace(
            pageBreakRegex,
            '<div class="page-break"></div>'
        );
        console.log('Manual page breaks processed');
    }

    // Process live-site-shield comments
    // Look for <!-- live-site-shield --> comments and add class to next paragraph
    const liveShieldRegex = /<!--\s*live-site-shield\s*-->\s*<p>/gi;
    if (liveShieldRegex.test(htmlContent)) {
        htmlContent = htmlContent.replace(
            liveShieldRegex,
            '<p class="live-site-shield">'
        );
        console.log('Live site shield styling applied');
    }

    // Process z-index-table comments
    // Look for <!-- z-index-table --> comments and add class to next table
    const zIndexTableRegex = /<!--[!?~\/\\*|—\^\^@#\[\s]*z-index-table\s*-->\s*<table>/gi;
    if (zIndexTableRegex.test(htmlContent)) {
        htmlContent = htmlContent.replace(
            zIndexTableRegex,
            '<table class="z-index-table">'
        );
        console.log('Z-index table styling applied');
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

    // Force Lato font after all other processing
    setTimeout(forceLato, 1000);
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
    --allow-file-access-from-files \
    --disable-web-security \
    --force-color-profile=srgb \
    --print-to-pdf="$OUTPUT_FILE" \
    --print-to-pdf-no-header \
    --no-pdf-header-footer \
    --disable-pdf-tagging \
    --virtual-time-budget=30000 \
    --run-all-compositor-stages-before-draw \
    --enable-font-antialiasing \
    "file:///tmp/md_styled.html" 2>/dev/null

# Clean up temporary fonts directory
rm -rf "$TEMP_FONTS_DIR" 2>/dev/null

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
