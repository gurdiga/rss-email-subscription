import { confirmationSecretLifetimeMs, isConfirmationSecretNotFound } from '../../domain/confirmation-secrets';
import {
  deleteConfirmationSecret,
  listConfirmationSecrets,
  loadConfirmationSecret,
} from '../../domain/confirmation-secrets-storage';
import { AppStorage } from '../../domain/storage';
import { Result, isErr, makeValues } from '../../shared/lang';
import { logDuration, makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { isNotEmpty } from '../../shared/array-utils';
import { makeDate } from '../../shared/date-utils';

// Every kind expires on the same clock now. Registration secrets used to be exempt, so
// the store only ever grew — and issuing a password reset scans all of it.

export function expireConfirmationSecrets(storage: AppStorage) {
  const logData = { module: expireConfirmationSecrets.name };

  logDuration('Confirmation secrets expiration', logData, async () => {
    const { logError, logWarning, logInfo } = makeCustomLoggers(logData);
    const secrets = listConfirmationSecrets(storage);

    if (isErr(secrets)) {
      logError(si`Failed to ${listConfirmationSecrets.name}: ${secrets.reason}`);
      return;
    }

    if (isNotEmpty(secrets.invalidConfirmationSecrets)) {
      logWarning(si`Found ${secrets.invalidConfirmationSecrets.length} invalid confirmation secrets`);
    }

    let expiredSecretsCount = 0;

    for (const secret of secrets.validConfirmationSecrets) {
      const secretData = loadConfirmationSecret(storage, secret);

      if (isErr(secretData)) {
        logWarning(si`Failed to ${loadConfirmationSecret.name}: ${secretData.reason}`);
        continue;
      }

      if (isConfirmationSecretNotFound(secretData)) {
        logWarning(si`Confirmation secred not found for expiration: ${secret.value}`);
        continue;
      }

      const parsedData = makeConfirmationSecretTimestamp(secretData);

      if (isErr(parsedData)) {
        logWarning(si`Failed to ${makeConfirmationSecretTimestamp.name}: ${parsedData.reason}`);
        continue;
      }

      const { timestamp } = parsedData;
      const isExpired = timestamp.getTime() < Date.now() - confirmationSecretLifetimeMs;

      if (!isExpired) {
        continue;
      }

      const deleteResult = deleteConfirmationSecret(storage, secret);

      if (isErr(deleteResult)) {
        logWarning(si`Failed to ${deleteConfirmationSecret.name}: ${deleteResult.reason}`);
        continue;
      }

      logInfo(si`Deleted confirmation secret ${secret.value} from ${timestamp.toISOString()}`);
      expiredSecretsCount++;
    }

    if (expiredSecretsCount > 0) {
      logInfo(si`Deleted confirmation secrets: ${expiredSecretsCount}`);
    }
  });
}

interface ConfirmationSecretTimestamp {
  timestamp: Date;
}

function makeConfirmationSecretTimestamp(data: unknown): Result<ConfirmationSecretTimestamp> {
  return makeValues<ConfirmationSecretTimestamp>(data, {
    timestamp: makeDate,
  });
}
