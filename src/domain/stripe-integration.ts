import { capitalize, si } from '../shared/string-utils';

export const stripePaymentMethodTypes = ['card'];

export interface StripeKeysResponseData {
  publishableKey: string;
}

export interface AccountSupportProductResponseData {
  name: string;
  description: string;
  priceInCents: number;
  paymentLinkUrl: string;
}

export interface Card {
  brand: string;
  exp_month: number;
  exp_year: number;
  last4: string;
}

export interface StoreCardRequest {
  brand: string;
  exp_month: number;
  exp_year: number;
  last4: string;
}

export type StoreCardRequestData = Record<keyof StoreCardRequest, string>;

const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function makeCardDescription(card: Card): string {
  const expMonthName = shortMonthNames[card.exp_month - 1] || '';
  const brandName = capitalize(card.brand);

  return si`${brandName} ••••${card.last4} expiring in ${expMonthName} ${card.exp_year}`;
}
