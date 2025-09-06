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
- 📖 **Page breaks** - supports manual page break comments (`<!--| PAGE-BREAK -->`)
- 🏷️ **PDF-only content** - special tags for content that only appears in PDF
- 📊 **Table column widths** - precise control over table column sizing with comments
- 🎨 **Professional styling** - clean typography with Lato fonts and consistent borders

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

<!--| PAGE-BREAK -->

## Section 2

Content on new page...
```

<!--| PAGE-BREAK -->

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

### Table Column Width Control

Control precise column widths in tables using special comments:

```markdown
<!--! col-widths: 50px, 150px, auto -->

| Icon | Name   | Description |
| ---- | ------ | ----------- |
| 🎯   | Target | Example row |
```

**Supported width formats:**

- **Fixed pixels**: `50px`, `150px`, `200px`
- **Percentages**: `10%`, `30%`, `60%`
- **Auto sizing**: `auto` (takes remaining space)

**Usage notes:**

- Place the comment directly above the table
- Widths are applied left-to-right to columns
- Use `<!--!` (exclamation) instead of `<!--~` (tilde) for the comment
- All tables get consistent border styling with `border-collapse: collapse`

### Image Processing

- **SVG Support**: Automatically converts to PNG when available
- **Icon Processing**: Complex HTML icons become simple colored squares
- **Responsive**: Images scale appropriately for print

## Styling Features

### Typography

- **Headers**: Purple H1 with underline, clean hierarchy for H2-H6
- **Body text**: Lato font family with optimized line spacing for print
- **Code blocks**: Syntax highlighting with rounded corners and monospace fonts
- **Tables**: Professional styling with consistent borders and proper cell padding

### Table Styling

- **Consistent borders**: All tables use `border-collapse: collapse` for clean lines
- **Header styling**: Solid bottom borders (`#999`) with proper padding
- **Cell styling**: Dotted bottom borders (`#ccc`) for subtle row separation
- **Column control**: Precise width control via HTML colgroup elements
- **Font consistency**: Lato font family applied to all table content

### Print Optimization

- **Page margins**: 0.5 inch on all sides
- **Font scaling**: Optimized sizes for print readability
- **Table formatting**: Fixed table layout with controlled column widths
- **Border consistency**: No gaps between table cell borders

## Output

- Input: `README.md` → Output: `README.pdf`
- Input: `myfile.md` → Output: `myfile.pdf`
- PDFs are created in the same directory as the input file

<!--| PAGE-BREAK -->

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

### Architecture

- ✅ **Portable** - No Node.js dependencies, works from any directory
- ✅ **Self-contained** - All styling and logic included
- ✅ **Cross-platform** - macOS and Linux support
- ✅ **Modular processing** - Separate stages for content, styling, and PDF generation

### Processing Pipeline

1. **Content Processing**: PDF-only tags and page breaks
2. **Markdown Conversion**: Pandoc converts MD to HTML
3. **Image Processing**: SVG to PNG conversion when available
4. **Table Enhancement**: Column width processing with HTML colgroup injection
5. **Style Application**: SCSS-compiled CSS with Lato fonts
6. **PDF Generation**: Puppeteer/Chrome headless rendering

### Column Width System

- **Regex matching**: Flexible pattern matching for table comments with attributes
- **HTML manipulation**: Direct colgroup injection with `!important` CSS
- **Conflict resolution**: Removes conflicting CSS rules that override column widths
- **Cross-table consistency**: Unified `border-collapse: collapse` for all tables

## Files

- `md-to-pdf.sh` - Main conversion script with column width processing
- `install.sh` - Installation helper for other projects
- `style/pdf.scss` - SCSS source for PDF styling (compiled to CSS)
- `style/pdf.min.css` - Compiled and minified CSS for PDF generation
- `fonts/` - Lato font family files for consistent typography
- `README.md` - This documentation

## License

©2025 [Feral Creative](https://feralcreative.co)/ [@feralcreative](https://github.com/feralcreative)
All rights reserved.
