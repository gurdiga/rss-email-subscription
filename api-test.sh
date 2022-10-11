#!/bin/bash

set -euo pipefail

BASE_URL=https://localhost.feedsubscription.com
SUBSCRIBER_EMAIL=api-test@feedsubscription.com
# echo -n "${SUBSCRIBER_EMAIL}${FEED_HASHING_SALT}" | sha256sum
EMAIL_HASH="b617571ab1974d3614e5f6c48449e08dc0129aa0f28f16a9d5e3cb9ee1f7c29b"
FEED_ID=gurdiga
EMAIL_DATA_FILE=$DATA_DIR_ROOT/$FEED_ID/emails.json

USER_PLAN=standard
USER_EMAIL=api-test-blogger@feedsubscription.com
USER_PASSWORD=A-long-S3cre7-password

function main {
	registration_do $USER_PLAN $USER_EMAIL $USER_PASSWORD
	registration_verify $USER_PLAN $USER_EMAIL
	authentication_do $USER_EMAIL $USER_PASSWORD
	remove_accounts $USER_EMAIL
	unsubscription_do
	unsubscription_verify
	subscription_do
	subscription_verify
	subscription_confirmation_do
	subscription_confirmation_verify
	unsubscription_do
	unsubscription_verify
	subscription_do
	resubscribe_failure_verify
	unsubscription_do
	unsubscribe_failure_verify
	web_ui_scripts
	verify_allows_embedding_js
	verify_has_cors_enabled
	verify_version_txt
}

function post {
	# shellcheck disable=SC2145
	curl -ks --fail-with-body -X POST $BASE_URL"$@"
}

function get {
	# shellcheck disable=SC2145
	curl -ks --fail-with-body $BASE_URL"$@"
}

function get_headers {
	# shellcheck disable=SC2145
	curl -ks --head $BASE_URL"$@"
}

function registration_do {
	local account_plan=${1:?}
	local account_email=${2:?}
	local account_password=${3:?}

	if post /registration -d plan="$account_plan" -d email="$account_email" -d password="$account_password"; then
		print_success
	else
		print_failure "POST /registration failed: exit code $?"
	fi
}

function registration_verify {
	local account_plan=${1:?}
	local account_email=${2:?}

	local account_file && account_file=$(find_account_files_by_email "${account_email}")
	local file_count && file_count=$(wc -l <<<"$account_file")

	if [ "$file_count" -eq "0" ]; then
		print_failure "Account file not found"
	elif [ "$file_count" -gt "1" ]; then
		print_failure "Found more than one account files with for $account_email"
	fi

	snapshot='{"plan":"'$account_plan'","email":"'$account_email'","hashedPassword":".+"}'

	if grep -E "$snapshot" "$account_file" >/dev/null; then
		print_success
	else
		echo -e "$(yellow Expected:) $snapshot\n"
		echo -e "$(yellow Actual:) $(cat "$account_file")\n"

		print_failure 'Account file contents does not match'
	fi
}

function authentication_do {
	local account_email=${1:?}
	local account_password=${2:?}

	if post /authentication -d email="$account_email" -d password="$account_password"; then
		print_success
	else
		print_failure "POST /authentication failed: exit code $?"
	fi
}

function remove_accounts {
	local account_email=${1:?}

	for account_file in $(find_account_files_by_email "${account_email}"); do
		ts-node src/api/delete-account-cli.ts "${account_email}"
	done
}

function find_account_files_by_email {
	local account_email=${1:?}

	find "$DATA_DIR_ROOT/accounts" -name account.json |
		while read -r account_file_path; do
			if grep "\"email\":\"$account_email\"" "$account_file_path" >/dev/null; then
				echo "$account_file_path"
			fi
		done
}

function subscription_do {
	local url="/subscription"

	if post $url -d feedId=$FEED_ID -d email=$SUBSCRIBER_EMAIL; then
		print_success
	else
		print_failure "POST $url failed: exit code $?"
	fi
}

function subscription_verify {
	if jq --exit-status ".$EMAIL_HASH | select(.isConfirmed == false)" "$EMAIL_DATA_FILE"; then
		print_success
	else
		jq . "$EMAIL_DATA_FILE"
		print_failure "Email not saved in emails.json? ☝️🤔"
		exit 1
	fi
}

function subscription_confirmation_do {
	local url="/subscription-confirmation"

	if post $url -d id=$FEED_ID-$EMAIL_HASH; then
		print_success
	else
		print_failure "POST $url failed: exit code $?"
	fi
}

function subscription_confirmation_verify {
	if jq --exit-status ".$EMAIL_HASH | select(.isConfirmed == true)" "$EMAIL_DATA_FILE"; then
		print_success
	else
		print_failure "Email does not have isConfirmed of true in emails.json"
		jq .$EMAIL_HASH "$EMAIL_DATA_FILE"
		exit 1
	fi
}

function unsubscription_do {
	local url="/unsubscription"

	if post $url -d id=$FEED_ID-$EMAIL_HASH; then
		print_success
	else
		print_failure "POST $url failed: exit code $?"
	fi
}

function unsubscription_verify {
	if jq --exit-status ".$EMAIL_HASH" "$EMAIL_DATA_FILE"; then
		print_failure "Email not removed from emails.json"
		jq . "$EMAIL_DATA_FILE"
		exit 1
	else
		print_success
	fi
}

function resubscribe_failure_verify {
	if diff -u \
		<(post /subscription -d feedId=$FEED_ID -d email=$SUBSCRIBER_EMAIL) \
		<(printf '{"kind":"InputError","message":"Email is already subscribed"}'); then
		print_success
	else
		print_failure
	fi
}

function unsubscribe_failure_verify {
	if diff -u \
		<(post /unsubscription -d id=$FEED_ID-$EMAIL_HASH) \
		<(printf '{"kind":"Success","message":"Solidly unsubscribed."}'); then
		print_success
	else
		print_failure
	fi
}

function web_ui_scripts {
	if get /web-ui-scripts/web-ui/unsubscription-confirmation.js | head -5; then
		print_success
	else
		print_failure
	fi
}

function assert_header {
	local url="$1"
	local header="$2"
	local actual_headers && actual_headers="$(get_headers "$url")"

	if echo "$actual_headers" | grep "$header"; then
		print_success
	else
		echo "$actual_headers"
		print_failure "Header missing? \"$header\""
	fi
}

function verify_allows_embedding_js {
	assert_header /web-ui-scripts/web-ui/subscription-form.js 'cross-origin-resource-policy: cross-origin'
}

function verify_has_cors_enabled {
	assert_header /subscription 'access-control-allow-origin: *'
}

function verify_version_txt {
	if diff <(get /api-version.txt) .git/refs/heads/main; then
		print_success
	else
		print_failure
	fi
}

function print_success {
	echo -e "\n$(green OK)\n"
}

function print_failure {
	local caller_name="${FUNCNAME[1]}"
	local prefix && prefix="$(red "FAILURE in $caller_name")"

	if test -z "$@"; then
		# shellcheck disable=SC2059
		printf "$prefix\n\n"
	else
		echo -e "\n$prefix: $(yellow "$@"))\n\n"
	fi

	exit 1
}

function red { printf "\e[31m%s\e[0m" "$@"; }
function green { printf "\e[32m%s\e[0m" "$@"; }
function yellow { printf "\e[33m%s\e[0m" "$@"; }

main
