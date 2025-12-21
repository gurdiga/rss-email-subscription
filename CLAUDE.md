# Notes for Claude Code

## Git Commit Messages

When creating commits, follow these guidelines:

1. **Do NOT include "Generated with Claude Code" line**
   - The `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>` trailer is sufficient
   - Redundant marketing text clutters the commit history

2. **Follow standard git commit message conventions**
   - Subject line: 50 characters or less
   - Body lines: Wrap at 72 characters
   - Blank line between subject and body
   - Use imperative mood in subject ("Add feature" not "Added feature")

### Example

```
Add failure detection to certbot weekly report

Change certbot renew schedule from every 12h to weekly
(Sat 11:55 PM), running just before certbot-report
(Sun midnight) for timely notification.

Enhance certbot-report to detect failures and adjust
email subject. Increase tail from 12 to 20 lines to
capture full failure output.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```
