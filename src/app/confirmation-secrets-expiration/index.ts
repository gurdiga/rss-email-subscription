import { basename } from 'node:path/posix';
import {
  ConfirmationSecret,
  confirmationSecretLifetimeMs,
  isConfirmationSecretNotFound,
  makeConfirmationSecret,
} from '../../domain/confirmation-secrets';
import {
  confirmationSecretsStorageKey,
  deleteConfirmationSecret,
  loadConfirmationSecret,
} from '../../domain/confirmation-secrets-storage';
import { AppStorage } from '../../domain/storage';
import { Err, Result, attempt, isErr, makeErr, makeValues } from '../../shared/lang';
import { logDuration, makeCustomLoggers } from '../../shared/logging';
import { si } from '../../shared/string-utils';
import { isNotEmpty } from '../../shared/array-utils';
import { makeDate } from '../../shared/date-utils';
import { RegistrationConfirmationSecretData } from '../../api/registration';

const unexpirableKinds: [RegistrationConfirmationSecretData['kind']] = ['RegistrationConfirmationSecretData'];

export function expireConfirmationSecrets(storage: AppStorage) {
  const logData = { module: expireConfirmationSecrets.name };

  logDuration('Confirmation secrets expiration', logData, async () => {
    const { logError, logWarning, logInfo } = makeCustomLoggers(logData);
    const secrets = getAllConfirmationSecrets(storage);

    if (isErr(secrets)) {
      logError(si`Failed to ${getAllConfirmationSecrets.name}: ${secrets.reason}`);
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

      const kind = (secretData as any).kind;

      if (unexpirableKinds.includes(kind)) {
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

interface ConfirmationSecretList {
  basenameErrs: BasenameErr[];
  validConfirmationSecrets: ConfirmationSecret[];
  invalidConfirmationSecrets: InvalidConfirmationSecret[];
}

interface BasenameErr {
  input: string;
  err: Err;
}

interface InvalidConfirmationSecret {
  input: string;
  err: Err;
}

function getAllConfirmationSecrets(storage: AppStorage): Result<ConfirmationSecretList> {
  const items = storage.listItems(confirmationSecretsStorageKey);

  if (isErr(items)) {
    return makeErr(si`Failed to list confirmation secrets from ${confirmationSecretsStorageKey}`);
  }

  const results: ConfirmationSecretList = {
    basenameErrs: [],
    validConfirmationSecrets: [],
    invalidConfirmationSecrets: [],
  };

  const hashes: string[] = [];

  items.forEach((x) => {
    const result = attempt(() => basename(x, '.json'));

    if (isErr(result)) {
      results.basenameErrs.push({ input: x, err: result });
    } else {
      hashes.push(result);
    }
  });

  hashes.forEach((x) => {
    const result = makeConfirmationSecret(x);

    if (isErr(result)) {
      results.invalidConfirmationSecrets.push({
        input: x,
        err: result,
      });
    } else {
      results.validConfirmationSecrets.push(result);
    }
  });

  return results;
}
