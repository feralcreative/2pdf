# Markdown to PDF Converter

A portable, self-contained script that converts Markdown files to beautifully formatted PDFs with no headers or footers.

## Features

- 🎨 **Beautiful styling** with Inter font and professional layout
- 🖼️ **Image support** - automatically converts SVG icons to PNG when available
- 📄 **Clean PDFs** - no headers, footers, or browser chrome
- 🔧 **Portable** - works from any project directory
- 📱 **Print-optimized** - responsive layout that looks great in PDF format
- 🎯 **Icon processing** - handles complex HTML icons and converts them to simple colored squares
- 📖 **Page breaks** - supports manual page break comments (`<!-- PAGE-BREAK -->`)

## Usage

### Basic Usage

```bash
# Convert README.md in current directory
./md-to-pdf.sh

# Convert a specific markdown file
./md-to-pdf.sh myfile.md
```

### Installation in New Projects

**Option 1: Manual Copy**

1. Copy the entire `md-to-pdf` folder to your project root
2. Run from your project directory:
   ```bash
   ./md-to-pdf/md-to-pdf.sh
   ```

**Option 2: Using Install Script**

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

If auto-installation fails:

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

## Output

- Input: `README.md` → Output: `README.pdf`
- Input: `myfile.md` → Output: `myfile.pdf`
- PDFs are created in the same directory as the input file

## Styling Features

### Typography

- **Headers**: Purple H1 with underline, clean hierarchy for H2-H6
- **Body text**: Inter font family with optimized line spacing
- **Code blocks**: Syntax highlighting with rounded corners
- **Tables**: Professional styling with alternating row colors

### Images & Icons

- **SVG Support**: Automatically converts to PNG when available
- **Icon Processing**: Complex HTML icons become simple colored squares
- **Responsive**: Images scale appropriately for print

### Print Optimization

- **Page margins**: 0.5 inch on all sides
- **Font scaling**: Optimized sizes for print readability
- **Table formatting**: Fixed column widths for consistent layout
- **Page breaks**: Manual control with HTML comments

## Advanced Features

### Manual Page Breaks

Add page breaks in your Markdown by including HTML comments:

```markdown
## Section 1

Content here...

<!-- PAGE-BREAK -->

## Section 2

Content on new page...
```

### PDF-Only Content Tags

You can include content that only appears in the PDF version using special HTML comments:

```markdown
<!-- PDF-ONLY-START -->

This content will only appear in the PDF, not in web/GitHub rendering.

- Perfect for print-specific instructions
- Copyright notices for printed versions
- Page-specific formatting notes
<!-- PDF-ONLY-END -->
```

The script automatically processes these tags:

- `<!-- PDF-ONLY-START -->` - Begin PDF-only content block
- `<!-- PDF-ONLY-END -->` - End PDF-only content block
- Content between these tags is visible in PDF but hidden in normal markdown rendering

**Common Use Cases:**

```markdown
<!-- PDF-ONLY-START -->

**Print Version - Generated:** $(date)
**Copyright:** © 2024 Your Company Name
**Internal Use Only** - Not for distribution

<!-- PDF-ONLY-END -->

# Project Documentation

Regular content here...

<!-- PDF-ONLY-START -->

> 📄 **Note for printed version:** This document contains interactive links that are not clickable in print. See the digital version for full functionality.

<!-- PDF-ONLY-END -->
```

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

## License

This script is provided as-is for personal and commercial use. Based on the original `readme-to-pdf.sh` from the House Hunt project.
