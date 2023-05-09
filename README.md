# rss-email-subscription

This is an RSS-to-email system that periodically checks one or more RSS feed and sends new items to a list of emails. Every feed has a list of emails associated.

Every feed gets its own feed-id@feedsubscription.com email address. The default frequecy is hourly now, but any [cron-like][0] schedule is supported.

[0]: https://github.com/node-cron/node-cron#cron-syntax

There is also an API which can be inspected in `src/api/server.ts`.

Everything is packed and deployed as a Docker composition: in
`docker-compose.yml`.

## Storage structure

The app stores data in the `DATA_DIR_ROOT` directory:

```
/settings.json
/accounts/<account_id>/account.json
/accounts/<account-id>/feeds/<feed-id>/feed.json
/accounts/<account-id>/feeds/<feed-id>/emails.json
/accounts/<account-id>/feeds/<feed-id>/inbox/<datetime-itehexx>.json
/accounts/<account-id>/feeds/<feed-id>/outbox/<datetime-itehexx>/<msghexx>.json
/accounts/<account-id>/feeds/<feed-id>/delivery-reports/<datetime-itehexx>/item.json
/accounts/<account-id>/feeds/<feed-id>/delivery-reports/<datetime-itehexx>/postfixed/<msghexx>.json
/accounts/<account-id>/feeds/<feed-id>/delivery-reports/<datetime-itehexx>/deferred/<msghexx>.json
/accounts/<account-id>/feeds/<feed-id>/delivery-reports/<datetime-itehexx>/sent/<msghexx>.json
/accounts/<account-id>/feeds/<feed-id>/delivery-reports/<datetime-itehexx>/bounced/<msghexx>.json
```
