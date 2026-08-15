# Notes for Claude Code

## Git Commit Messages

These rules are the house style, derived from the 2731 commits in this repo written without an agent. Match that register — agent-authored commits should be indistinguishable from the surrounding history. The percentages below are measured over those commits; `git log` is the reference when a rule is unclear.

### Shape

1. **Usually the subject line and nothing else.** 92.6% of commits have no body. Add one only when there is a *why* that the diff cannot show. The `Co-Authored-By` trailer is not body prose — a bare subject plus the trailer is the modal commit.
2. **Keep the subject near 30 characters.** Median is 29, p90 is 46. Fifty is a ceiling nobody approaches, not a target.
3. **Prefix with a scope and a colon** in about half of commits. The scope is whatever names the thing that changed: a directory (`web-ui/shared:`), a container (`smtp-in:`), a function (`makeRssItem:`), a filename (`docker-compose.yml:`), a Make target (`make backup:`), or a feature by its display name (`Email footer:`). Nesting is fine: `delmon: heartbeat: add lineCountDiff`.
4. **Lowercase after the scope**, 95% of the time. `web-ui: no demoAccountNote`, not `web-ui: No demoAccountNote`.
5. **Never end the subject with a period.**
6. **Write a fragment, not a sentence.** Only about a third of subjects open with a verb; the rest are telegraphic noun phrases (`app: no NPM_VERSION`, `ms-throttle: 1/5`) or the literal command that was run (`npm i cheerio@latest`, `mv {parse,make}Date`).

### Bodies, when there is one

7. **Blank line after the subject, then a subordinate clause that finishes the subject as one sentence.** `Because …` opens 18% of bodies and `Otherwise …` gives the same construction from the failure side.
8. **Rationale, never enumeration.** The subject already says what changed; the body says why, or what breaks otherwise, or why the obvious alternative was rejected. Do not list files touched.
9. **Prose, not bullets** — bullets appear in 6 of 203 bodies. Wrap prose at 72 characters. Pasted evidence (terminal output, error text, URLs) is exempt: introduce it with a line ending in a colon and paste it verbatim, unreflowed.
10. **First person is normal.** This is a personal log, not a changelog entry.

### Vocabulary

11. **Curly apostrophes and quotes in prose; no em dashes.** There are zero em dashes in the corpus, and every contraction he writes uses `’`.
12. **His idioms**: `intro X` for a new function or module (never "introduce", never "add function"), `mv A B` for a rename, `no X` for a removal, `sketch` for exploratory work, `tweak` for a small adjustment, a `(2)`/`(3)` suffix for a fix that needed retrying.
13. **Do not use `Housekeeping`.** It is the second most common subject word corpus-wide and it is a dead habit — 14% of subjects in 2021–22, 2% since 2024. Reading it off the aggregate is the easiest way to sound dated.
14. **No Conventional Commits, no `[bracket]` prefixes, no changelog verbs** (`refactor`, `chore`, `feat`, `implement`, `enhance`, `ensure`). None of them appear in the corpus.

### Trailer

Close with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`, naming the model that actually wrote the commit. Do not add the "Generated with Claude Code" line.

Note that GitHub squash merges silently drop co-author trailers from the squashed commits, so a trailerless commit on `main` is not proof of unassisted authorship.

### Examples

The modal commit — a scoped, lowercase, five-word subject and nothing else:

```
logrotate: dateext

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```

The rare body, in full:

```
make certbot-report update

Because logs are now rotated monthly.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```

## Working Directory

The working directory is always the project root. Use plain `git` commands without `-C`; no need for absolute path workarounds in git operations.

## Running the Integration Tests

`make test` runs the unit suite only — it does **not** cover `api-test.spec.ts`. A green unit run says nothing about the integration tests.

Those need the containerized stack:

```bash
make start-api   # blocks — run it in its own terminal
make api-test
make stop        # tear the stack down afterwards
```

`start-api` runs `docker compose up` without `--detach`, so it stays in the foreground rather than returning. Nothing brings the containers down when the tests finish, which makes `make stop` required cleanup rather than a nicety.

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
