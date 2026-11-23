# Prod host config

This is the prod configuration that lives outside the containers: root’s crontab and the two mail channels the host uses for its own alerts. The files mirror their paths on the host. `host/crontab` is root’s crontab.

## Workflow

Edit the files here, not on the host. After `git pull` on prod:

```bash
make host-diff      # what would change; non-zero when the host has drifted
make host-install   # overwrites the installed copies
```

A `crontab -e` on prod is drift, not a change: `host-install` replaces the crontab with `host/crontab`. If something gets changed on the host directly, copy it back here before the next install.

One file is not in the repo: `/etc/msmtp-password`, which holds the app password of `res.system.notifications@gmail.com`, a Gmail account that exists only to send these alerts. `/etc/msmtprc` reads it through `passwordeval`. Create it with mode 600 and owner root, containing only the password. `host-install` refuses to run without it, because msmtp failing to authenticate silences every alert.

## The two mail channels

Alerts must not depend on smtp-out, because smtp-out is often the container they report on. So there are two channels, and they watch each other:

- **msmtp → Gmail** (`smtp.gmail.com:587`). Used by `bin/notify`, which every watcher and `bin/check-containers` pipe into, and by apticron. Every attempt is logged to `/var/log/msmtp`.
- **ssmtp → smtp-out** (`localhost:1587`). Used only by `watch-msmtp`, which tails `/var/log/msmtp` and reports failed sends. Anything else that calls `/usr/sbin/sendmail` also goes this way.

apticron is the odd one. It mails through `/usr/bin/mailx` (bsd-mailx), which would normally call `/usr/sbin/sendmail`. Instead, `/etc/cron.d/apticron` sets `MAILRC=/etc/apticron/mailrc`, which points bsd-mailx at `/usr/local/sbin/apticron-sendmail`. That wrapper adds the same `List-Id` that `bin/notify` adds and hands the message to msmtp.

Do not install `msmtp-mta`, and do not divert `/usr/sbin/sendmail` to msmtp. msmtp-mta conflicts with ssmtp, so apt would remove ssmtp, and `watch-msmtp` would lose the only channel that can report msmtp being broken.

## Checking it works

msmtp, through `bin/notify`:

```bash
echo "Subject: RES test" | bin/notify | cat   # the pipe matters: to a terminal, notify only prints
tail -1 /var/log/msmtp                        # expect exitcode=EX_OK
```

apticron, run the way cron runs it:

```bash
env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin MAILRC=/etc/apticron/mailrc /usr/sbin/apticron
tail -1 /var/log/msmtp                        # a new EX_OK line, mailsize several KB
```

In Gmail, the report must carry `List-Id: RES alerts <res-alerts.feedsubscription.com>` and have a single `Received:` hop from smtp.gmail.com. A `(Postfix)` hop means it went through smtp-out.

## After an OS upgrade

Most of what can go wrong here doesn’t stop mail. It reroutes mail back through smtp-out, which keeps working until the day smtp-out is the thing that’s down. Run `make host-diff`, then check:

- **`readlink -e /usr/bin/mailx` is still `/usr/bin/bsd-mailx`.** If it became s-nail or heirloom-mailx, apticron takes a different code path that ignores `set sendmail=`, and reports go through ssmtp again. The s-nail equivalent is `mta=`.
- **`/etc/cron.d/apticron` still has the `MAILRC` line.** It’s a conffile: an apticron upgrade that changes it asks whether to keep the local version, and choosing the maintainer’s version drops the line. `host-install` puts it back.
- **ssmtp is still installed.** Debian has been retiring it. Without it, `watch-msmtp` can’t send, and nothing reports msmtp failures. Any replacement must relay through smtp-out, not Gmail.
- **The apticron check above still passes.** It’s the end-to-end test. The other checks only narrow down why it failed.
