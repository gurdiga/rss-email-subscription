Conventions

- Keep changes scoped and minimal.
- Add a co-author trailer on agent-made commits: `Co-authored-by: Codex CLI <codex-cli@users.noreply.github.com>`
- Format examples as fenced code blocks with the correct language tag (e.g., `dockerfile` for Dockerfile instructions, `bash` for shell).
- When proposing multiple options, prefer a numbered list so they are easier to scan and reference.
- Wrap long lines in commit messages: subject ≤ 72 chars, body wrapped at ~72 chars for readability.
- Hadolint DL3018: do not suppress; pin `apk add` packages to exact versions whenever possible. If pinning is truly impossible, explain why in a comment next to the instruction.
- Markdown files: do not hard-wrap paragraphs. Keep each paragraph on a single line and let the renderer/editor handle wrapping. Only insert line breaks for semantic structure (lists, headings, tables, block quotes, code fences) or deliberate breaks.
