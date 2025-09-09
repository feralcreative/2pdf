<!-- PDF-ONLY
<div class="pdf-source"><p>This PDF was generated on {{DATE_TODAY}} from [README.md](https://github.com/feralcreative/md2pdf/blob/main/README.md) in my [private Git repo](https://github.com/feralcreative/md2pdf/). For access, please [contact me](mailto:ziad@feralcreative.co) or [contact me](https://feral.ly/signal).
</p></div>
-->

# MD<sub>2</sub>PDF

A portable, self-contained script that converts Markdown files to beautifully formatted PDFs.

## Features

- 🖼️ **Image support** - automatically converts SVG icons to PNG when available
- 🔧 **Portable** - works from any project directory
- 📱 **Print-optimized** - responsive layout that looks great in PDF format
- 📖 **Page breaks** - supports manual page break comments (`<!-- PAGE-BREAK -->`)
- 🏷️ **PDF-only content** - special tags for content that only appears in PDF (`<!-- PDF-ONLY` or `<!-- PDF ONLY`)
- 📊 **Table column widths** - precise control over table column sizing with comments (`<!--! col-widths:`)
- 🔄 **Token replacement** - dynamic content with configurable tokens (`{{DEVELOPER_NAME}}`, `{{DATE_TODAY}}`, etc.)

## Usage

### Basic Usage

```bash
# Convert README.md in current directory
./md2pdf.sh

# Convert a specific markdown file
./md2pdf.sh myfile.md
```

<!--| PAGE-BREAK -->

### Installation in New Projects

#### Option 1: Manual Copy

1. Copy the entire `md2pdf` folder to your project root
2. Run from your project directory:
   ```bash
   ./md2pdf/md2pdf.sh
   ```

#### Option 2: Using Install Script

1. From within the `md2pdf` directory:
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

#### macOS:

```bash
brew install pandoc
# Chrome: Download from https://www.google.com/chrome/
```

#### Linux:

```bash
# Ubuntu/Debian
sudo apt-get install pandoc google-chrome-stable

# CentOS/RHEL
sudo yum install pandoc google-chrome-stable
```

<!--| PAGE-BREAK -->

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

<!--| PAGE-BREAK -->

### PDF-Only Content Tags

You can include content that only appears in the PDF version using special HTML comments:

```markdown
<!-- PDF-ONLY
This content will only appear in the PDF, not in web/GitHub rendering.

- Perfect for print-specific instructions
- Copyright notices for printed versions
- Page-specific formatting notes
-->

<!-- PDF ONLY
Alternative format with space instead of dash - both work identically
-->
```

The script automatically processes these tags:

- `<!-- PDF-ONLY` - Content block that only appears in PDF (with dash)
- `<!-- PDF ONLY` - Alternative format with space instead of dash
- Content is processed as **both HTML and Markdown** during PDF generation
- Completely invisible in web/GitHub rendering
- Supports complex formatting including lists, links, and styling

**Common Use Cases:**

```markdown
<!-- PDF-ONLY
**Print Version - Generated:** January 2025
**Copyright:** © 2025 Your Company Name
**Internal Use Only** - Not for distribution
-->

## Project Documentation

<!-- PDF ONLY
> 📄 **Note for printed version:** This document contains interactive links
> that are not clickable in print. See the digital version for full functionality.

For technical support, contact: support@company.com
-->
```

**Advanced Features:**

- **Dual processing**: Content is converted from Markdown to HTML, then embedded in PDF
- **Rich formatting**: Supports all Markdown features including tables, code blocks, and links
- **Flexible syntax**: Use either `PDF-ONLY` or `PDF ONLY` - both formats work identically
- **Clean integration**: No impact on web rendering or GitHub display

<!--| PAGE-BREAK -->

### Token Replacement System

The script supports dynamic token replacement to automatically populate content like developer names, dates, and project information. Tokens use the format `{{TOKEN_NAME}}` and are replaced during PDF generation.

#### Configuration File

Create a `md2pdf.config` file in either:

- The same directory as `md2pdf.sh` (script directory)
- The current working directory where you run the script

```bash
# md2pdf.config example
DEVELOPER_NAME=John Doe
GITHUB_HANDLE=johndoe
DEVELOPER_EMAIL=john@example.com
COMPANY_NAME=Acme Corp
PROJECT_VERSION=2.1.0
LICENSE=MIT License
```

#### Available Tokens

**User-Defined Tokens** (from config file):

- `{{DEVELOPER_NAME}}` - Developer's full name
- `{{GITHUB_HANDLE}}` - GitHub username
- `{{DEVELOPER_EMAIL}}` - Email address
- `{{COMPANY_NAME}}` - Company/organization
- `{{PROJECT_VERSION}}` - Project version
- `{{LICENSE}}` - License information
- Any custom tokens you define

**Automatic Date/Time Tokens**:

- `{{DATE_TODAY}}` - Current date (2025-01-08)
- `{{DATE_TODAY_LONG}}` - Long date format (January 08, 2025)
- `{{TIME_NOW}}` - Current time (14:30)
- `{{DATETIME_NOW}}` - Date and time (2025-01-08 14:30)
- `{{YEAR}}`, `{{MONTH}}`, `{{DAY}}` - Individual date components
- `{{TIMESTAMP}}` - Unix timestamp

**System Information Tokens**:

- `{{HOSTNAME}}` - System hostname
- `{{USERNAME}}` - Current user
- `{{PWD}}` - Current working directory
- `{{SCRIPT_DIR}}` - Script location
- `{{PROJECT_NAME}}` - Auto-generated from directory name (or from config)

#### Usage Example

```markdown
# {{PROJECT_NAME}} Documentation

**Created by:** {{DEVELOPER_NAME}} ([@{{GITHUB_HANDLE}}](https://github.com/{{GITHUB_HANDLE}}))
**Generated:** {{DATE_TODAY_LONG}} at {{TIME_NOW}}
**Version:** {{PROJECT_VERSION}}

## Contact

For questions about this project, contact {{DEVELOPER_EMAIL}}.

---

_Document generated on {{DATETIME_NOW}} by {{USERNAME}}@{{HOSTNAME}}_
```

**Features:**

- ✅ **Automatic fallbacks**: Missing config file doesn't break the script
- ✅ **Smart defaults**: `PROJECT_NAME` auto-generates from directory name
- ✅ **Warning system**: Alerts about unprocessed tokens
- ✅ **Flexible placement**: Config file can be in script or working directory

<!--| PAGE-BREAK -->

### Configuration File Format

Create a `md2pdf.config` file with this format:

```bash
# Comments start with # and are ignored
# Empty lines are also ignored

# Developer Information
DEVELOPER_NAME=Your Full Name
GITHUB_HANDLE=yourusername
DEVELOPER_EMAIL=you@example.com
COMPANY_NAME=Your Company
DEVELOPER_ROLE=Your Role

# Project Information
PROJECT_NAME=                    # Leave empty to auto-generate from directory
PROJECT_VERSION=1.0.0
PROJECT_DESCRIPTION=Your project description
PROJECT_REPO=https://github.com/yourusername/yourproject

# Custom tokens
LICENSE=MIT License
CONTACT_INFO=For questions, contact {{DEVELOPER_EMAIL}}
FOOTER_TEXT=Generated on {{DATE_TODAY}} by {{DEVELOPER_NAME}}

# Add your own custom tokens
CUSTOM_TOKEN=Custom Value
ANOTHER_TOKEN=Another Value
```

### Advanced Token Features

#### Nested Tokens

Tokens can contain other tokens, which are processed in multiple passes:

```bash
# In config file:
CONTACT_INFO=For questions, contact {{DEVELOPER_EMAIL}}
FOOTER_TEXT=Generated on {{DATE_TODAY}} by {{DEVELOPER_NAME}}

# In markdown:
{{CONTACT_INFO}}
# Becomes: For questions, contact john@example.com

{{FOOTER_TEXT}}
# Becomes: Generated on 2025-01-08 by John Doe
```

<!--| PAGE-BREAK -->

#### Special Characters

The system properly handles URLs, paths, and special characters:

```bash
PROJECT_REPO=https://github.com/user/repo-name
PWD_PATH={{PWD}}/subfolder
```

#### Config File Locations

The script looks for `md2pdf.config` in this order:

1. **Script directory**: Same folder as `md2pdf.sh`
2. **Working directory**: Where you run the script from

This allows for:

- **Global config**: Place in script directory for all projects
- **Project-specific config**: Place in each project directory

### Common Use Cases

#### Document Headers

```markdown
# {{PROJECT_NAME}} Documentation

**Version:** {{PROJECT_VERSION}}
**Author:** {{DEVELOPER_NAME}} ([@{{GITHUB_HANDLE}}](https://github.com/{{GITHUB_HANDLE}}))
**Company:** {{COMPANY_NAME}}
**Generated:** {{DATE_TODAY_LONG}}
```

#### Contact Information

```markdown
## Support

For technical support:

- **Email:** {{DEVELOPER_EMAIL}}
- **GitHub:** [@{{GITHUB_HANDLE}}](https://github.com/{{GITHUB_HANDLE}})
- **Repository:** {{PROJECT_REPO}}
```

#### Document Footers

```markdown
---

_{{FOOTER_TEXT}}_

**System Info:** Generated by {{USERNAME}} on {{HOSTNAME}} at {{DATETIME_NOW}}
```

#### PDF-Only Content with Tokens

```markdown
<!-- PDF ONLY
## Print Information

**Document generated:** {{DATETIME_NOW}}
**System:** {{USERNAME}}@{{HOSTNAME}}
**Version:** {{PROJECT_VERSION}}
**Contact:** {{DEVELOPER_EMAIL}}
-->
```

### Token Processing Order

The script processes tokens in this specific order to handle nested tokens correctly:

1. **Config file tokens** (multiple passes to resolve nested tokens)
2. **Automatic date/time tokens** (processed last to handle tokens within config values)
3. **System information tokens**

This means you can use automatic tokens inside your config file values:

```bash
# This works - DATE_TODAY will be replaced after FOOTER_TEXT
FOOTER_TEXT=Generated on {{DATE_TODAY}} by {{DEVELOPER_NAME}}
```

### Troubleshooting Tokens

#### Unprocessed Token Warnings

If you see warnings like:

```
⚠️ Warning: Found unprocessed tokens:
   {{SOME_TOKEN}}
```

**Solutions:**

- Add the token to your `md2pdf.config` file
- Check for typos in token names (case-sensitive)
- Ensure the config file is in the correct location

#### Config File Not Found

If you see:

```
ℹ️ No config file found (looked for md2pdf.config in script and current directories)
```

**Solutions:**

- Create `md2pdf.config` in the script directory (global)
- Create `md2pdf.config` in your project directory (project-specific)
- The script will still work without a config file (no token replacement)

#### Special Characters in Values

For values containing special characters, the script automatically escapes them:

```bash
# These work correctly:
PROJECT_REPO=https://github.com/user/repo-name
SPECIAL_PATH=/path/with/slashes
REGEX_PATTERN=^[a-z]+$
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

Simply copy the `md2pdf` folder to any project and run the script.

## License

This script is provided as-is for personal or commercial use or whatever.
