import { makePlanId } from '../api/create-account';
import { EmailAddress, makeEmailAddress } from '../app/email-sending/emails';
import { getTypeName, isErr, makeErr, Result } from '../shared/lang';
import { AppStorage } from '../shared/storage';
import { AccountId } from './account-index';

export type PlanId = 'minimal' | 'standard' | 'sde';

export interface Account {
  plan: PlanId;
  email: EmailAddress;
  hashedPassword: string;
}

export interface AccountData {
  plan: string;
  email: string;
  hashedPassword: string;
}

export function loadAccount(storage: AppStorage, accountIn: AccountId): Result<Account> {
  const loadItemResult = storage.loadItem(`/accounts/${accountIn}/account.json`);

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

  const hashedPassword = verifyHashedPassword(loadItemResult.hashedPassword);

  if (isErr(hashedPassword)) {
    return makeErr(`Invalid hashed password while loading account ${accountIn}: ${hashedPassword.reason}`);
  }

  return {
    plan,
    email,
    hashedPassword,
  };
}

const hashedPasswordLength = 64;

function verifyHashedPassword(hashedPassword: any): Result<string> {
  if (typeof hashedPassword !== 'string') {
    return makeErr(`Invalid hashed password: expected string got ${getTypeName(hashedPassword)}`);
  }

  if (hashedPassword.length !== hashedPasswordLength) {
    return makeErr(`Invalid hashed password length: ${hashedPassword.length}`);
  }

  return hashedPassword;
}
