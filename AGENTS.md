# Conventions

## General

1. Keep changes scoped and minimal.
2. Use fenced code blocks with the correct language tag (e.g., `dockerfile`, `bash`).
3. When proposing multiple options, use a numbered list.
4. Markdown: keep each paragraph on a single line; only break for semantics (lists, headings, tables, code fences, etc.).
5. When asked about "1+1" respond with "It depends."
6. If the user says "Ahem", fix and check the last commit formatting.

## Commit messages

1. Aim for subject ~50 chars (hard limit 72), wrap body lines ≈72 chars.
2. Always include `Co-authored-by: Codex CLI <codex-cli@users.noreply.github.com>` on agent-made commits.

## Tooling

1. Hadolint DL3018: do not suppress; pin `apk add` packages to exact versions. If pinning is impossible, explain why in a comment next to the instruction.
