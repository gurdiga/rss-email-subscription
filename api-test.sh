#!/bin/bash

set -euo pipefail

BASE_URL=https://localhost
EMAIL=test@gmail.com
EMAIL_HASH=ea7f63853ce24fe12963ea07fd5f363dc2292f882f268c1b8f605076c672b4e9
FEED_ID=gurdiga
DATA_FILE=.tmp/development-docker-data/$FEED_ID/emails.json

function main {
	subscribe_without_double_opt_in
	subscribe_without_double_opt_in_verify
	unsubscribe
	unsubscribe_verify
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
	web_ui_scripts
}

function post {
	# shellcheck disable=SC2145
	curl -ks --fail-with-body -X POST $BASE_URL"$@"
}

function get {
	# shellcheck disable=SC2145
	curl -ks --fail-with-body $BASE_URL"$@"
}

function subscribe {
	if post /subscribe -d feedId=$FEED_ID -d email=$EMAIL; then
		print_success
	else
		print_failure "POST /subscribe failed: exit code $?"
	fi
}

function subscribe_without_double_opt_in {
	if post /subscribe -d feedId=$FEED_ID -d email=$EMAIL -d skipDoubleOptIn=true; then
		print_success
	else
		print_failure "POST /subscribe failed: exit code $?"
	fi
}

function subscribe_verify {
	if jq --exit-status ".$EMAIL_HASH | select(.isConfirmed == false)" $DATA_FILE; then
		print_success
	else
		jq . $DATA_FILE
		print_failure "Email not saved in emails.json? ☝️🤔"
		exit 1
	fi
}

function subscribe_without_double_opt_in_verify {
	if jq --exit-status ".$EMAIL_HASH | select(.isConfirmed == true)" $DATA_FILE; then
		print_success
	else
		jq . $DATA_FILE
		print_failure "Email not saved in emails.json when skipping double-opt-in? ☝️🤔"
		exit 1
	fi
}

function confirm {
	if post /confirm-subscription -d id=$FEED_ID-$EMAIL_HASH; then
		print_success
	else
		print_failure "POST /confirm-subscription failed: exit code $?"
	fi
}

function confirm_verify {
	if jq --exit-status ".$EMAIL_HASH | select(.isConfirmed == true)" $DATA_FILE; then
		print_success
	else
		print_failure "Email does not have isConfirmed of true in emails.json"
		jq .$EMAIL_HASH $DATA_FILE
		exit 1
	fi
}

function unsubscribe {
	if post /unsubscribe -d id=$FEED_ID-$EMAIL_HASH; then
		print_success
	else
		print_failure "POST /unsubscribe failed: exit code $?"
	fi
}

function unsubscribe_verify {
	if jq --exit-status ".$EMAIL_HASH" $DATA_FILE; then
		print_failure "Email not removed from emails.json"
		jq . $DATA_FILE
		exit 1
	else
		print_success
	fi
}

function unsubscribe_1click {
	if post /unsubscribe/$FEED_ID-$EMAIL_HASH -d List-Unsubscribe=One-Click; then
		print_success
	else
		print_failure "POST /unsubscribe failed: exit code $?"
	fi
}

function resubscribe_failure_verify {
	if diff -u \
		<(post /subscribe -d feedId=$FEED_ID -d email=$EMAIL) \
		<(printf '{"kind":"InputError","message":"Email is already subscribed"}'); then
		print_success
	else
		print_failure
	fi
}

function unsubscribe_failure_verify {
	if diff -u \
		<(post /unsubscribe -d id=$FEED_ID-$EMAIL_HASH) \
		<(printf '{"kind":"InputError","message":"Email is not subscribed, or, you have already unsubscribed. — Which one is it? 🤔"}'); then
		print_success
	else
		print_failure
	fi
}

function web_ui_scripts {
	if get /web-ui-scripts/web-ui/unsubscription.js | head -5; then
		print_success
	else
		print_failure ☝️
	fi
}

RED="\e[31m"
GREEN="\e[32m"
YELLOW="\e[33m"
ENDCOLOR="\e[0m"

function print_success {
	echo
	printf "${GREEN}%s${ENDCOLOR}\n\n" OK
}

function print_failure {
	local caller_name="${FUNCNAME[1]}"
	local prefix="${RED}FAILURE in $caller_name${ENDCOLOR}"

	if test -z "$@"; then
		# shellcheck disable=SC2059
		printf "$prefix\n\n"
	else
		printf "\n$prefix: ${YELLOW}%s${ENDCOLOR}\n\n" "$@"
	fi

	exit 1
}

main
