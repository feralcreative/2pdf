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

### Option 1: Manual Copy

1. Copy the entire `md-to-pdf` folder to your project root
2. Run from your project directory:
   ```bash
   ./md-to-pdf/md-to-pdf.sh
   ```

### Option 2: Using Install Script

1. From within the `md-to-pdf` directory:
   ```bash
   ./install.sh /path/to/your/project
   ```
2. The script will copy everything needed and make it executable

## Dependencies

The script automatically handles dependencies:

- **Pandoc** - Auto-installed via Homebrew on macOS
- **Google Chrome or Chromium** - Used for PDF generation

### Manual Installation

**macOS:**

```bash
brew install pandoc
# Chrome: Download from https://www.google.com/chrome/
```

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

Include content that only appears in the PDF:

```markdown
<!-- PDF ONLY
This content will only appear in the PDF, not in web/GitHub rendering.

- Perfect for print-specific instructions
- Copyright notices for printed versions
-->
```

Or alternatively:

```markdown
<!-- PDF-ONLY
This content will only appear in the PDF, not in web/GitHub rendering.

- Perfect for print-specific instructions
- Copyright notices for printed versions
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

## Portability

This script is designed to be completely portable:

- ✅ No Node.js dependencies
- ✅ No project-specific configurations
- ✅ Works from any directory
- ✅ Self-contained styling and logic
- ✅ Cross-platform (macOS, Linux)

Simply copy the `md-to-pdf` folder to any project and run the script.

## Files

- `md-to-pdf.sh` - Main conversion script
- `install.sh` - Installation helper for other projects
- `README.md` - This documentation

## License

©2025 [Feral Creative](https://feralcreative.co)/ [@feralcreative](https://github.com/feralcreative)
All rights reserved.
