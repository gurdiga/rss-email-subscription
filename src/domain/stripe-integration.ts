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
