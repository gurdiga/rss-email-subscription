# Notes for Claude Code

## Git Commit Messages

The commit message house style lives in `~/CLAUDE.md` and applies here unchanged — scope-colon prefixes, lowercase after the scope, subjects near 30 characters, bodies only when there is a *why* the diff cannot show.

It was derived from the 2731 commits in this repo written without an agent, so `git log` is the reference whenever a rule is unclear.

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
