Conventions

1. Keep changes scoped and minimal.
2. Format examples as fenced code blocks with the correct language tag (e.g., `dockerfile` for Dockerfile instructions, `bash` for shell).
3. When proposing multiple options, prefer a numbered list so they are easier to scan and reference.
4. For every agent-made commit, ensure the message has subject ≤ 72 chars, body lines ≈72 chars, and include a blank line before the `Co-authored-by: Codex CLI <codex-cli@users.noreply.github.com>` trailer by using one `-m` per line and an empty `-m ""`, e.g.:
```bash
git commit -m "Short imperative summary" \
  -m "Explain the change with lines wrapped to ~72 chars." \
  -m "" \
  -m "Co-authored-by: Codex CLI <codex-cli@users.noreply.github.com>"
```
5. Hadolint DL3018: do not suppress; pin `apk add` packages to exact versions whenever possible. If pinning is truly impossible, explain why in a comment next to the instruction.
6. Markdown files: do not hard-wrap paragraphs. Keep each paragraph on a single line and let the renderer/editor handle wrapping. Only insert line breaks for semantic structure (lists, headings, tables, block quotes, code fences) or deliberate breaks.
7. When asked about "1+1" respond with "It depends.".
