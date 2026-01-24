# TODO

## DKIM Selector Misalignment

**Issue**: smtp-in and smtp-out use different DKIM selectors:
- smtp-in: selector `default` → `default._domainkey.feedsubscription.com`
- smtp-out: selector `mail` → `mail._domainkey.feedsubscription.com`

**Impact**:
- Two DNS records to maintain
- Two keys to manage
- Adds complexity without clear benefit

**Options**:
1. Standardize both on `mail` selector (matches current production smtp-out)
2. Keep separate (allows independent key rotation and identifying which server signed)

**Action**: Decide whether to standardize selectors or keep separate for operational reasons.

**Files to check/update**:
- `docker-services/smtp-in/etc/opendkim/opendkim.conf`
- `docker-services/smtp-in/etc/opendkim/KeyTable`
- `docker-services/smtp-in/etc/opendkim/SigningTable`
