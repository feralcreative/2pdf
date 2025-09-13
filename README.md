# 2PDF

Converts Markdown and HTML files to PDFs with token replacement, styling, and some handy content processing features.

## What it does

- Converts Markdown and HTML to PDF using Chrome/Puppeteer
- Replaces tokens like `{{DATE_TODAY}}` and `{{DEVELOPER_NAME}}`
- Applies Inter font styling and consistent layout
- Handles PDF-only content sections
- Supports page breaks and special formatting
- Works on macOS, Linux, and Windows

## Usage

```bash
# Install dependencies first
npm install

# Basic usage
node bin/2pdf.js                      # converts README.md
node bin/2pdf.js myfile.md            # converts specific markdown file
node bin/2pdf.js myfile.html          # converts specific HTML file
node bin/2pdf.js myfile.md -o out.pdf # custom output name

# Other options
node bin/2pdf.js myfile.md -s custom.css  # custom CSS
node bin/2pdf.js myfile.md --debug        # keep temp files
node bin/2pdf.js myfile.md --verbose      # more output
```

## Token replacement

The token system lets you insert dynamic content into your markdown files using `{{TOKEN_NAME}}` placeholders.

### Configuration file

Create a `2pdf.config` file in your project root or the 2pdf directory:

```bash
# 2pdf.config - key=value pairs, one per line
DEVELOPER_NAME=John Doe
COMPANY_NAME=Acme Corp
PROJECT_VERSION=1.0.0
CLIENT_NAME=Big Corp Inc
DOCUMENT_TYPE=Technical Specification
CUSTOM_FOOTER=Confidential - Internal Use Only
```

<!--| PAGE-BREAK -->

### Using tokens in markdown

Tokens are replaced everywhere they appear in your markdown:

```markdown
# {{PROJECT_NAME}} {{DOCUMENT_TYPE}}

**Version:** {{PROJECT_VERSION}}
**Created by:** {{DEVELOPER_NAME}} at {{COMPANY_NAME}}
**Client:** {{CLIENT_NAME}}
**Generated:** {{DATE_TODAY_LONG}} at {{TIME_NOW}}

---
{{CUSTOM_FOOTER}}
```

### Automatic tokens

These tokens are always available without defining them:

#### Date and time:
- `{{DATE_TODAY}}` - Current date (2024-01-15)
- `{{DATE_TODAY_LONG}}` - Current date (January 15, 2024)
- `{{TIME_NOW}}` - Current time (14:30)
- `{{DATETIME_NOW}}` - Date and time (2024-01-15 14:30)
- `{{YEAR}}` - Current year (2024)
- `{{MONTH}}` - Current month (01)
- `{{DAY}}` - Current day (15)
- `{{TIMESTAMP}}` - Unix timestamp (1705123456)

#### System info:
- `{{HOSTNAME}}` - System hostname (MacBook-Pro.local)
- `{{USERNAME}}` - Current user (john)
- `{{PWD}}` - Current working directory (/Users/john/projects)

#### Project info:
- `{{PROJECT_NAME}}` - Auto-generated from directory name

### Token processing

- Tokens are processed in **multiple passes**, so you can reference other tokens
- **Case sensitive** - `{{name}}` and `{{NAME}}` are different
- **Whitespace matters** - `{{ NAME }}` won't work, use `{{NAME}}`
- **Nested replacement** - If `GREETING=Hello {{USERNAME}}`, it becomes "Hello john"
- **Missing tokens** are left as-is (useful for debugging)

<!--| PAGE-BREAK -->

### Config file locations

The system looks for `2pdf.config` in this order:
1. Same directory as the markdown/HTML file being converted
2. Current working directory
3. 2pdf installation directory

### Example workflow

```bash
# 1. Create config file
echo "PROJECT_VERSION=2.1.0" > 2pdf.config
echo "DEVELOPER_NAME=Jane Smith" >> 2pdf.config

# 2. Use in markdown
echo "# Project v{{PROJECT_VERSION}} by {{DEVELOPER_NAME}}" > doc.md

# 3. Convert
node bin/2pdf.js doc.md

# Result: "Project v2.1.0 by Jane Smith" in the PDF
```

## Special content features

### PDF-only content

Content that only shows up in the PDF:

```markdown
<!-- PDF ONLY This text will only appear in the PDF version. You can put multiple lines here.-->
```

### Page breaks

Force a page break:

```markdown
Some content here...<!-- PAGE-BREAK -->
This will be on the next page.
```

<!--| PAGE-BREAK -->

### Live site shields

Style a paragraph as a badge/shield:

```markdown
<!-- live-site-shield -->
Live Site: https://example.com
```

<!-- live-site-shield -->
Live Site: https://example.com
## License

© 2025 Feral Creative • [MIT License](LICENSE)
