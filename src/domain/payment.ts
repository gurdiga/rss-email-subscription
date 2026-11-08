import { Environment } from '@paddle/paddle-node-sdk';
import { makeErr, Result } from '../shared/lang';
import { capitalize, si } from '../shared/string-utils';

export type PaddleEnvironment = `${Environment}`;

export function makePaddleEnvironment(value: string): Result<PaddleEnvironment> {
  if (!isPaddleEnvironment(value)) {
    return makeErr(si`Invalid PADDLE_ENVIRONMENT: "${value}"; expected sandbox or production`);
  }

  return value;
}

function isPaddleEnvironment(value: string): value is PaddleEnvironment {
  return (Object.values(Environment) as string[]).includes(value);
}

export interface PaddleCustomerId {
  kind: 'PaddleCustomerId';
  value: string;
}

// The ID becomes a filename in the customer index, so nothing but Paddle’s own
// shape gets through: “ctm_” and 26 lowercase base-32 characters.
export function makePaddleCustomerId(value: unknown, field = 'paddleCustomerId'): Result<PaddleCustomerId> {
  if (typeof value !== 'string' || !/^ctm_[a-z0-9]{26}$/.test(value)) {
    return makeErr(si`Invalid Paddle customer ID: "${String(value)}"`, field);
  }

  return { kind: 'PaddleCustomerId', value };
}

export interface PaddleKeysResponseData {
  clientToken: string;
  environment: PaddleEnvironment;
}

export interface PaddleDataResponseData {
  trialPeriodDays: number;
}

export interface AccountSupportProductResponseData {
  name: string;
  description: string;
  priceInCents: number;
}

export interface Card {
  brand: string;
  exp_month: number;
  exp_year: number;
  last4: string;
}

const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function makeCardDescription(card: Card): string {
  const expMonthName = shortMonthNames[card.exp_month - 1] || '';
  const brandName = capitalize(card.brand);

  return si`${brandName} ••••${card.last4} expiring in ${expMonthName} ${card.exp_year}`;
}
