<!-- PDF-ONLY
<span style="font-size: 10px; font-weight: 500; color: #333; margin:-2em 0 4em 0 ; display:block; padding:0.25em 1em; border:1px solid #808;border-radius: 2em; text-align:center; background-color:#F2E6F2">
<strong>Note:</strong> This PDF was generated automagically from [README.md](https://github.com/feralcreative/md-to-pdf/blob/main/README.md).
</span>
-->

# Markdown to PDF Converter

A portable, self-contained script that converts Markdown files to beautifully formatted PDFs with no headers or footers.

## Features

- 🖼️ **Image support** - automatically converts SVG icons to PNG when available
- 🔧 **Portable** - works from any project directory
- 📱 **Print-optimized** - responsive layout that looks great in PDF format
- 📖 **Page breaks** - supports manual page break comments (`<!-- PAGE-BREAK -->`)
- 🏷️ **PDF-only content** - special tags for content that only appears in PDF

## Quick Start

```bash
# Convert README.md in current directory
./md-to-pdf.sh

# Convert a specific markdown file
./md-to-pdf.sh myfile.md
```

## Installation

**Option 1: Manual Copy**
Copy the entire `md-to-pdf` folder to your project root, then run `./md-to-pdf/md-to-pdf.sh`

**Option 2: Using Install Script**
From within the `md-to-pdf` directory, run `./install.sh /path/to/your/project` to automatically copy and set up everything

## Dependencies

The script automatically handles dependencies on macOS. For manual installation:

- **Pandoc** - Auto-installed via Homebrew on macOS (`brew install pandoc`)
- **Google Chrome or Chromium** - Download from https://www.google.com/chrome/

**Linux:**

```bash
# Ubuntu/Debian
sudo apt-get install pandoc google-chrome-stable

# CentOS/RHEL
sudo yum install pandoc google-chrome-stable
```

## Advanced Features

### Manual Page Breaks

Add page breaks in your Markdown:

```markdown
## Section 1

Content here...

<!-- PAGE-BREAK -->

## Section 2

Content on new page...
```

<!-- PAGE-BREAK -->

### PDF-Only Content

Include content that only appears in the PDF using either format:

```markdown
<!-- PDF ONLY
This content will only appear in the PDF, not in web/GitHub rendering.

- Perfect for print-specific instructions
- Copyright notices for printed versions
-->

<!-- PDF-ONLY (alternative format)
Same functionality with dash instead of space
-->
```

### Image Processing

- **SVG Support**: Automatically converts to PNG when available
- **Icon Processing**: Complex HTML icons become simple colored squares
- **Responsive**: Images scale appropriately for print

## Styling Features

### Typography

- **Headers**: Purple H1 with underline, clean hierarchy for H2-H6
- **Body text**: Inter font family with optimized line spacing
- **Code blocks**: Syntax highlighting with rounded corners
- **Tables**: Professional styling with alternating row colors

### Print Optimization

- **Page margins**: 0.5 inch on all sides
- **Font scaling**: Optimized sizes for print readability
- **Table formatting**: Fixed column widths for consistent layout

## Output

- Input: `README.md` → Output: `README.pdf`
- Input: `myfile.md` → Output: `myfile.pdf`
- PDFs are created in the same directory as the input file

<!-- PAGE-BREAK -->

## Troubleshooting

### Common Issues

**"Pandoc not found"**

- Install manually: `brew install pandoc` (macOS) or use your package manager

**"Chrome not found"**

- Install Google Chrome from https://www.google.com/chrome/
- Or install Chromium as alternative

**"PDF generation failed"**

- Check that input Markdown file exists
- Ensure Chrome/Chromium is properly installed
- Check `/tmp/md_styled.html` for debugging

### Debug Mode

The script saves the intermediate HTML file at `/tmp/md_styled.html` for inspection if issues occur.

## Technical Details

- ✅ **Portable** - No Node.js dependencies, works from any directory
- ✅ **Self-contained** - All styling and logic included
- ✅ **Cross-platform** - macOS and Linux support

## Files

- `md-to-pdf.sh` - Main conversion script
- `install.sh` - Installation helper for other projects
- `README.md` - This documentation

## License

©2025 [Feral Creative](https://feralcreative.co)/ [@feralcreative](https://github.com/feralcreative)
All rights reserved.
