# Notes for Claude Code

## Git Commit Messages

When creating commits, follow these guidelines:

1. **Do NOT include "Generated with Claude Code" line**
   - The `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` trailer is sufficient
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

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Working Directory

The working directory is always the project root. Use plain `git` commands without `-C`; no need for absolute path workarounds in git operations.

## SSH Connections to Production

When operating on prod (feedsubscription.com), always use persistent SSH connections via ControlMaster to improve performance and reduce authentication overhead.

### Setup

Establish a master connection:

```bash
ssh -M -S ~/.ssh/control-feedsubscription -o ControlPersist=10m -fN feedsubscription.com
```

### Usage

Use the persistent connection for subsequent commands:

```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com <command>
```

The connection persists for 10 minutes after last use.
