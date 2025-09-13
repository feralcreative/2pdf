# Token Protection Test

This document tests that tokens in backticks are NOT replaced.

## Regular tokens (should be replaced)
- Current date: {{DATE}}
- Developer: {{DEVELOPER_NAME}}
- Project: {{PROJECT_NAME}}

## Inline code tokens (should NOT be replaced)
- Use `{{DATE}}` to insert the current date
- The `{{DEVELOPER_NAME}}` token shows the developer name
- Set `PROJECT_VERSION={{PROJECT_VERSION}}` in your config

## Code block tokens (should NOT be replaced)

```bash
# Example config file
DEVELOPER_NAME=John Doe
PROJECT_VERSION=1.0.0

# Use tokens in markdown like this:
echo "Generated on {{DATE}} by {{DEVELOPER_NAME}}" > doc.md
```

```markdown
# {{PROJECT_NAME}} Documentation
**Version:** {{PROJECT_VERSION}}
**Generated:** {{DATE}} by {{DEVELOPER_NAME}}
```

## Mixed content
Regular token: {{DATE}}
Inline code: `{{DATE}}`
Another regular: {{DEVELOPER_NAME}}

The end.
