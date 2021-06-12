# rss-email-subscription

We have a blog and a list of email addresses. We want an app that would watch the blog’s RSS feed, and would email the new blog posts to the aforementioned email addresses.

Could I set up a cron job that would run an app/script to check the RSS and then send the emails on any news?

It seem like I need 2 pieces:

1. an app to keep track of the RSS, and yield the new content;
   - https://www.npmjs.com/package/rss-parser
   - https://www.npmjs.com/package/rss-watcher
2. an app to keep track of emails, and send the new content to emails.
