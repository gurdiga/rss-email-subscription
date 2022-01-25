#!/bin/bash

set -exuo pipefail

BASE_URL=https://localhost
EMAIL=test@gmail.com
EMAIL_HASH=ea7f63853ce24fe12963ea07fd5f363dc2292f882f268c1b8f605076c672b4e9
FEED_ID=gurdiga
DATA_FILE=.tmp/development-docker-data/$FEED_ID/emails.json

function main {
	subscribe
	subscribe_verify
	confirm
	confirm_verify
	unsubscribe
	unsubscribe_verify
	subscribe
	unsubscribe_1click
	unsubscribe_verify
	subscribe
	resubscribe_failure_verify
	unsubscribe
	unsubscribe_failure_verify
}

function post {
	# shellcheck disable=SC2145
	curl -ks --fail-with-body -X POST $BASE_URL"$@"
}

function subscribe {
	post /subscribe -d feedId=$FEED_ID -d email=$EMAIL
	echo
}

function subscribe_verify {
	if jq --exit-status ".$EMAIL_HASH | select(.isConfirmed == false)" $DATA_FILE; then
		echo OK
	else
		echo "Email not saved in emails.json"
		jq . $DATA_FILE
		exit 1
	fi
}

function confirm {
	post /confirm-subscription -d id=$FEED_ID-$EMAIL_HASH
	echo
}

function confirm_verify {
	if jq --exit-status ".$EMAIL_HASH | select(.isConfirmed == true)" $DATA_FILE; then
		echo OK
	else
		echo "Email does not have isConfirmed of true in emails.json"
		jq .$EMAIL_HASH $DATA_FILE
		exit 1
	fi
}

function unsubscribe {
	post /unsubscribe -d id=$FEED_ID-$EMAIL_HASH
	echo
}

function unsubscribe_verify {
	if jq --exit-status ".$EMAIL_HASH" $DATA_FILE; then
		echo "Email not removed from emails.json"
		jq . $DATA_FILE
		exit 1
	else
		echo OK
	fi
}

function unsubscribe_1click {
	post /unsubscribe/$FEED_ID-$EMAIL_HASH -d List-Unsubscribe=One-Click
	echo
}

function resubscribe_failure_verify {
	diff -u \
		<(post /subscribe -d feedId=$FEED_ID -d email=$EMAIL) \
		<(printf '{"kind":"InputError","message":"Email is already subscribed"}') \
		&& echo OK
}

function unsubscribe_failure_verify {
	diff -u \
		<(post /unsubscribe -d id=$FEED_ID-$EMAIL_HASH) \
		<(printf '{"kind":"InputError","message":"Email is not subscribed, or, you have already unsubscribed. — Which one is it? 🤔"}') \
		&& echo OK
}

main
