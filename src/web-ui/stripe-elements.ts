import { Stripe, StripeConstructor } from '@stripe/stripe-js/types/stripe-js/stripe';
import { Result, makeErr } from '../shared/lang';
import { StripeKeys } from '../shared/stripe-keys';

export function getStripe(): Result<Stripe> {
  if (!('Stripe' in window)) {
    return makeErr('Stripe global not found');
  }

  const publishableKey =
    location.hostname === 'localhost.feedsubscription.com' // prettier: keep these stacked
      ? StripeKeys.PublishableTest
      : StripeKeys.PublishableLive;

  const Stripe = window.Stripe as StripeConstructor;
  const stripe = Stripe(publishableKey);

  return stripe;
}
