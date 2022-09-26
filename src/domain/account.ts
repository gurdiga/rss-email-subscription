import { makePlanId } from '../api/create-account';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { isErr, makeErr, Result } from '../shared/lang';
import { AppStorage, StorageKey } from '../shared/storage';
import { AccountId } from './account-index';
import { HashedPassword, makeHashedPassword } from './hashed-password';

export type PlanId = 'minimal' | 'standard' | 'sde';

export interface Account {
  plan: PlanId;
  email: EmailAddress;
  hashedPassword: HashedPassword;
}

export interface AccountData {
  plan: string;
  email: string;
  hashedPassword: string;
}

export function loadAccount(
  storage: AppStorage,
  accountIn: AccountId,
  storageKey: StorageKey = `/accounts/${accountIn}/account.json`
): Result<Account> {
  const loadItemResult = storage.loadItem(storageKey);

  if (isErr(loadItemResult)) {
    return makeErr(`Can’t load account data: ${loadItemResult.reason}`);
  }

  const email = makeEmailAddress(loadItemResult.email);

  if (isErr(email)) {
    return makeErr(`Invalid email while loading account ${accountIn}: ${email.reason}`);
  }

  const plan = makePlanId(loadItemResult.plan);

  if (isErr(plan)) {
    return makeErr(`Invalid plan ID while loading account ${accountIn}: ${plan.reason}`);
  }

  const hashedPassword = makeHashedPassword(loadItemResult.hashedPassword);

  if (isErr(hashedPassword)) {
    return makeErr(`Invalid hashed password while loading account ${accountIn}: ${hashedPassword.reason}`);
  }

  return {
    plan,
    email,
    hashedPassword,
  };
}
