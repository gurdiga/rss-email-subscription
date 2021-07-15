# rss-email-subscription

Say we have a blog and a list of email addresses. We want an app that would watch the blog’s RSS feed, and would email the new blog posts to every email address.

## 2 pieces:

1. `src/rss-checking/main.ts`: an app that fetches the given RSS feed, and records the new items; run with `make run-rss-checking`.
2. `src/email-sending/main.ts`: an app that knows the email addresses, and delivers the new items; run with `make run-email-sending`; SMTP config comes from envars.

Somehow I managed to gray-box TDD everything following the [advice from GeePaw Hill][0].

[0]: https://www.geepawhill.org/2020/06/12/microtest-tdd-more-definition/

## TODO:

- Setup a sample Docker composition with:
  - an SMTP service to do the delivering; it has to be properly configured with SPF and stuff.
  - a cron service; it will run the above 2 pieces once a day, or maybe more often.
- Collect new email addresses from blog subscribers.
- Allow adding multiple feed URLs and lists of email addresses.
