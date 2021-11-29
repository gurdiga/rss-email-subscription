# rss-email-subscription

This is a system that periodically checks one or more RSS feed and sends new items to a list of emails (aka RSS-to-email). Every feed has a list of emails associated.

Every feed gets its own feed-name@feedsubscription.com address. The default frequecy is hourly now, but any node-cron schedule is supported.

There is also an API:

- `POST /subscribe` to register an email address to follow a feed; email confirmation is coming soon.
- `POST /unsubscribe` to unregister an email from following a feed; this endpoint also supports the [One-Click Unsubscribe standard][0] used by email lists, but I’m not adding the `List-Unsubscribe` any-more because GMail puts the emails in the Promotions folder.

[0]: https://certified-senders.org/wp-content/uploads/2019/08/One-Click-Unsubscribe-now-mandatory.pdf

No website yet; coming soon.

Everything is packed as a Docker composition:

1. `app` checks the RSS and sends the emails; runs in a Nodejs container.
2. `smtp-out` a slightly customized Postfix container based on boky/postfix.
3. `smtp-in` another Postfix coninater, this time based on zixia/simple-mail-forwarder, that receives @feedsubscription email and forwards it to my GMail inbox.
4. `website` is a container based on the official nginx Docker image, with a buch of static files.
5. `certbot` for updating website’s LetsEncrypt certificates.
6. `logger` an Alpine container with syslog-ng that collects the logs from all the other containers.
