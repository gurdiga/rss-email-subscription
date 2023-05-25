import {
  Appearance,
  Stripe,
  StripeConstructor,
  StripeElementsOptionsMode,
  StripePaymentElementOptions,
} from '@stripe/stripe-js';
import { ApiPath } from '../domain/api-path';
import { StripeConfigResponseData } from '../domain/stripe-integration';
import { isAppError, isInputError } from '../shared/api-response';
import { Result, asyncAttempt, isErr, makeErr } from '../shared/lang';
import { clearValidationErrors, sendApiRequest } from './shared';

export interface PaymentSubformHandle {
  isComplete: boolean;
  focus: () => void;
}

export async function initPaymentSubform(paymentSubform: HTMLElement): Promise<Result<PaymentSubformHandle>> {
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

  const elementsOptions: StripeElementsOptionsMode = {
    mode: 'setup',
    currency: 'usd',
    appearance,
    paymentMethodTypes: ['card'],
  };
  const elements = stripe.elements(elementsOptions);

  const createOptions: StripePaymentElementOptions = {
    wallets: {
      applePay: 'auto',
      googlePay: 'auto',
    },
  };

  const paymentElement = elements.create('payment', createOptions);
  const paymentSubformStatus: PaymentSubformHandle = { isComplete: false, focus: () => paymentElement.focus() };

  paymentElement.on('change', (event) => {
    clearValidationErrors({ paymentSubform });
    paymentSubformStatus.isComplete = event.complete;
  });

  paymentElement.mount(paymentSubform);

  return paymentSubformStatus;
}

async function loadStripeKeys(): Promise<Result<StripeConfigResponseData>> {
  const response = await asyncAttempt(() => sendApiRequest<StripeConfigResponseData>(ApiPath.stripeKeys));

  if (isErr(response)) {
    return response;
  }

  if (isAppError(response) || isInputError(response)) {
    return makeErr(response.message);
  }

  if (!response.responseData) {
    return makeErr('Error: Empty response');
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

export function submitPaymentSubform(paymentSubformHandle: PaymentSubformHandle): Result<void> {
  if (!paymentSubformHandle.isComplete) {
    return makeErr('Please fill in the payment details');
  }

  // TODO:
  // - create Stripe customer
  // - create Stripe subscription
}
