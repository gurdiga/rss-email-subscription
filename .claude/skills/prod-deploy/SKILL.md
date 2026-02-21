---
name: prod-deploy
description: Deploy services to feedsubscription.com production. Use when the user asks to deploy, push to prod, restart a container on prod, or rebuild an image on production. Handles git push, SSH ControlMaster setup, and running make targets remotely.
---

# Prod Deploy

Deploys one or more services to feedsubscription.com.

## Standard workflow

### 1. Push commits

```bash
git push
```

### 2. Establish SSH ControlMaster

```bash
ssh -M -S ~/.ssh/control-feedsubscription -o ControlPersist=10m -fN feedsubscription.com
echo "ControlMaster established"
```

Skip if already established (the command will silently succeed or fail harmlessly).

### 3. Deploy

```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  'cd ~/src/rss-email-subscription && git pull && make <targets> start'
```

Replace `<targets>` with the services to rebuild before restarting.

## Service → make target mapping

| Service      | Target     | Notes                          |
|--------------|------------|--------------------------------|
| app          | `app`      | Also rebuilds delmon (FROM app) |
| certbot      | `certbot`  |                                |
| logger       | `logger`   |                                |
| website      | `website`  |                                |
| smtp-in      | `smtp-in`  |                                |
| smtp-out     | `smtp-out` |                                |
| resolver     | `resolver` |                                |
| delmon       | `delmon`   | Or just rebuild app            |

`make start` (always included) runs `docker compose up --remove-orphans --detach`
and restarts only the containers whose images changed.

## Examples

Deploy only app:
```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  'cd ~/src/rss-email-subscription && git pull && make app start'
```

Deploy certbot, logger, and website together:
```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  'cd ~/src/rss-email-subscription && git pull && make certbot logger website start'
```

Deploy all images (full rebuild):
```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  'cd ~/src/rss-email-subscription && git pull && make all-images start'
```

## Notes

- Always `git push` before deploying so `git pull` on prod gets the latest commits.
- `make start` is always appended — it's a no-op for containers whose image didn't change.
- Timeout: allow up to 5 minutes for builds that compile TypeScript (app) or download pip packages (certbot).
- After certbot rebuilds: verify with `docker exec certbot python -c "import certbot; import OpenSSL; print('ok')"`.
