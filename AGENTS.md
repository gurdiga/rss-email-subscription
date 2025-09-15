Conventions

1. Keep changes scoped and minimal.
2. Add a co-author trailer on agent-made commits: `Co-authored-by: Codex CLI <codex-cli@users.noreply.github.com>`
3. Format examples as fenced code blocks with the correct language tag (e.g., `dockerfile` for Dockerfile instructions, `bash` for shell).
4. When proposing multiple options, prefer a numbered list so they are easier to scan and reference.
5. Wrap long lines in commit messages: subject ≤ 72 chars, body wrapped at ~72 chars for readability.
6. Hadolint DL3018: do not suppress; pin `apk add` packages to exact versions whenever possible. If pinning is truly impossible, explain why in a comment next to the instruction.
7. Markdown files: do not hard-wrap paragraphs. Keep each paragraph on a single line and let the renderer/editor handle wrapping. Only insert line breaks for semantic structure (lists, headings, tables, block quotes, code fences) or deliberate breaks.
