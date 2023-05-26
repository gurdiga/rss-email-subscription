import { Appearance, SetupIntentResult, Stripe, StripeConstructor, StripeElements } from '@stripe/stripe-js';
import { ApiPath } from '../domain/api-path';
import { StripeKeysResponseData, stripePaymentMethodTypes } from '../domain/stripe-integration';
import { isAppError, isInputError } from '../shared/api-response';
import { AnyAsyncFunction, Result, asyncAttempt, isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import { reportUnexpectedEmptyResponseData, sendApiRequest } from './shared';

export interface PaymentSubformHandle {
  validate(): Promise<Result<Awaited<ReturnType<StripeElements['submit']>>>>;
  confirmSetup(clientSecret: string): Promise<Result<SetupIntentResult>>;
  focus(): void;
}

export async function initPaymentSubform(
  paymentSubform: HTMLElement,
  clearValidationState: () => void
): Promise<Result<PaymentSubformHandle>> {
  const stripeKeys = await loadStripeKeys();

  if (isErr(stripeKeys)) {
    return stripeKeys;
  }

  const { publishableKey } = stripeKeys;
  const stripe = getStripe(publishableKey);

  if (isErr(stripe)) {
    return stripe;
  }

  const getCssVariable = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name);

  const appearance: Appearance = {
    theme: 'stripe',
    variables: {
      fontFamily: getCssVariable('--bs-body-font-family'),
      colorText: getCssVariable('--bs-body-color'),
      colorTextSecondary: getCssVariable('--bs-secondary'),
      colorDanger: getCssVariable('--bs-danger'),
      colorSuccess: getCssVariable('--bs-success'),
      colorWarning: getCssVariable('--bs-warning'),
      borderRadius: getCssVariable('--bs-border-radius'),
      focusBoxShadow: 'inset 0 1px 2px rgba(0,0,0,.075), 0 0 0 0.25rem rgba(1,99,238,.35)',
      focusOutline: '2px solid #80b1f7',
    },
  };

  const elements = stripe.elements({
    mode: 'setup',
    currency: 'usd',
    appearance,
    paymentMethodTypes: stripePaymentMethodTypes,
  });

  const paymentElement = elements.create('payment');

  paymentElement.mount(paymentSubform);
  paymentElement.on('change', clearValidationState);

  const paymentSubformHandle: PaymentSubformHandle = {
    focus: () => paymentElement.focus(),

    validate: async () =>
      await attemptStripeCall(
        // prettier: keep these stacked
        () => elements.submit(),
        'elements.submit',
        'validate payment information'
      ),

    confirmSetup: async (clientSecret: string) =>
      await attemptStripeCall(
        () => stripe.confirmSetup({ elements, clientSecret, redirect: 'if_required' }),
        'stripe.confirmSetup',
        'set up payment'
      ),
  };

  return paymentSubformHandle;
}

export async function attemptStripeCall<F extends AnyAsyncFunction>(
  f: F,
  callName: string,
  description: string
): Promise<Result<ReturnType<F>>> {
  const result = await asyncAttempt(f);

  if (isErr(result)) {
    reportError(si`Got error from ${callName}: ${result.reason}`);
    return makeErr(description);
  }

  const error = result.error;

  if (!error) {
    // Success
    return result;
  }

  const errorMessage = error.message;

  if (!errorMessage) {
    reportError(si`Got StripeError with empty "message" from ${callName}`);
    return makeErr(description);
  }

  return makeErr(errorMessage);
}

async function loadStripeKeys(): Promise<Result<StripeKeysResponseData>> {
  const apiPath = ApiPath.stripeKeys;
  const response = await asyncAttempt(() => sendApiRequest<StripeKeysResponseData>(apiPath));

  if (isErr(response)) {
    return response;
  }

  if (isAppError(response) || isInputError(response)) {
    return makeErr(response.message);
  }

  if (!response.responseData) {
    reportUnexpectedEmptyResponseData(apiPath);
    return makeErr('Empty response');
  }

  return response.responseData;
}

function getStripe(publishableKey: string): Result<Stripe> {
  if (!('Stripe' in window)) {
    return makeErr('Stripe global not found');
  }

  const Stripe = window.Stripe as StripeConstructor;
  const stripe = Stripe(publishableKey);

  return stripe;
}
