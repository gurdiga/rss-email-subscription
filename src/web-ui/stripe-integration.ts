import {
  Appearance,
  PaymentMethod,
  SetupIntentResult,
  Stripe,
  StripeConstructor,
  StripeElements,
  StripePaymentElement,
} from '@stripe/stripe-js';
import { ApiPath } from '../domain/api-path';
import { PlanId, Plans, isSubscriptionPlan, makePlanId } from '../domain/plan';
import { Card, StoreCardRequestData, StripeKeysResponseData } from '../domain/stripe-integration';
import { InputError, isAppError, isInputError, makeInputError } from '../shared/api-response';
import { isNotEmpty } from '../shared/array-utils';
import {
  AnyAsyncFunction,
  Result,
  asyncAttempt,
  getErrorMessage,
  isErr,
  isObject,
  makeErr,
  makeNumber,
  makeValues,
} from '../shared/lang';
import { si } from '../shared/string-utils';
import { createElement } from './dom-isolation';
import { HttpMethod, reportAppError, reportUnexpectedEmptyResponseData, sendApiRequest } from './shared';

export interface PaymentSubformHandle {
  setPlanId(planId: PlanId): Promise<Result<void>>;
  validate(): Promise<Result<Awaited<ReturnType<StripeElements['submit']>>>>;
  confirmSetup(clientSecret: string): Promise<Result<SetupIntentResult>>;
  focus(): void;
}

export async function makePaymentSubformHandle(
  planId: PlanId,
  paymentSubform: HTMLElement,
  clearValidationState: () => void
): Promise<Result<PaymentSubformHandle>> {
  let stripe: Stripe;
  let paymentElement: StripePaymentElement;
  let elements: StripeElements;

  const paymentSubformHandle: PaymentSubformHandle = {
    setPlanId: async (planId) => {
      if (!stripe) {
        const stripeResult = await getStripe();

        if (isErr(stripeResult)) {
          return makeErr(si`Failed to ${getStripe.name}: ${stripeResult.reason}`);
        }

        stripe = stripeResult;
      }

      const buildResult = await buildPaymentElement(stripe, planId, paymentSubform, clearValidationState);

      if (isErr(buildResult)) {
        return buildResult;
      }

      [paymentElement, elements] = buildResult;

      return;
    },

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
        () =>
          stripe.confirmSetup({
            elements,
            clientSecret,
            confirmParams: { expand: ['payment_method'] },
            redirect: 'if_required',
          }),
        'stripe.confirmSetup',
        'set up payment'
      ),
  };

  if (!isSubscriptionPlan(planId)) {
    return paymentSubformHandle;
  }

  const result = paymentSubformHandle.setPlanId(planId);

  if (isErr(result)) {
    return makeErr(si`Failed to ${paymentSubformHandle.setPlanId.name}: ${result.reason}`);
  }

  return paymentSubformHandle;
}

async function buildPaymentElement(
  stripe: Stripe,
  planId: PlanId,
  domElement: HTMLElement,
  onChange: () => void
): Promise<Result<[StripePaymentElement, StripeElements]>> {
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

  const amount = await getCentAmountForPlan(planId);

  if (isErr(amount)) {
    return makeErr(si`Failed to ${getCentAmountForPlan.name}: ${amount.reason}`);
  }

  const elements = stripe.elements({
    mode: 'subscription',
    amount,
    currency: 'usd',
    appearance,
    paymentMethodTypes: ['card'],
  });

  const paymentElement = elements.create('payment');

  paymentElement.mount(domElement);
  paymentElement.on('change', onChange);

  return [paymentElement, elements];
}

async function getCentAmountForPlan(planId: PlanId): Promise<Result<number>> {
  const planPrices = await loadPlanPrices();

  if (isErr(planPrices)) {
    return planPrices;
  }

  const planPrice = planPrices.find((x) => x.planId === planId);

  if (!planPrice) {
    return makeErr(si`No price for plan ${planId}`);
  }

  return planPrice.amountInCents;
}

export async function attemptStripeCall<F extends AnyAsyncFunction>(
  f: F,
  callName: string,
  description: string
): Promise<Result<ReturnType<F>>> {
  const result = await asyncAttempt(f);

  if (isErr(result)) {
    reportError(si`Got error from ${callName}: ${result.reason}`);
    return makeErr(si`Failed to ${description}`);
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

interface PlanPriceData {
  planId: PlanId;
  priceInDollars: number;
}

interface PlanPrice {
  planId: PlanId;
  amountInCents: number;
}

let planPrices: PlanPrice[] = [];

async function loadPlanPrices(): Promise<Result<PlanPrice[]>> {
  if (isNotEmpty(planPrices)) {
    return planPrices;
  }

  const path = '/plans.json';
  const response = await asyncAttempt(() => fetch(path));

  if (isErr(response)) {
    return response;
  }

  const list = await response.json();

  if (!Array.isArray(list)) {
    return makeErr(si`Prices from ${path} is not an array`);
  }

  planPrices = [];

  for (const item of list) {
    const planPriceData = makeValues<PlanPriceData>(item, {
      planId: makePlanId,
      priceInDollars: makeNumber,
    });

    if (isErr(planPriceData)) {
      return planPriceData;
    }

    const { planId: planId, priceInDollars } = planPriceData;

    if (priceInDollars <= 0) {
      return makeErr(si`Invalid plan price: planId=${planId} priceInDollars=${priceInDollars}`);
    }

    planPrices.push({ planId, amountInCents: priceInDollars * 100 });
  }

  return planPrices;
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

async function getStripe(): Promise<Result<Stripe>> {
  const stripeKeys = await loadStripeKeys();

  if (isErr(stripeKeys)) {
    return makeErr(si`Failed to ${loadStripeKeys.name}: ${stripeKeys.reason}`);
  }

  const { publishableKey } = stripeKeys;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');

    script.src = 'https://js.stripe.com/v3/';

    script.onload = () => {
      if ('Stripe' in window) {
        const Stripe = window.Stripe as StripeConstructor;
        const stripe = Stripe(publishableKey);

        resolve(stripe);
      } else {
        reject(makeErr('Stripe global not found'));
      }
    };

    script.onerror = (error) => {
      reject(makeErr(getErrorMessage(error)));
    };

    document.body.appendChild(script);
  });
}

export async function maybeValidatePaymentSubform<FIELD extends string>(
  paymentSubformHandle: PaymentSubformHandle,
  planId: string,
  fieldName: FIELD
): Promise<InputError | void> {
  if (!isSubscriptionPlan(planId)) {
    return;
  }

  const validateResult = await paymentSubformHandle.validate();

  if (isErr(validateResult)) {
    return makeInputError<FIELD>(validateResult.reason, fieldName);
  }
}

export async function maybeConfirmPayment<FIELD extends string>(
  paymentSubformHandle: PaymentSubformHandle,
  planId: string,
  clientSecret: string,
  fieldName: FIELD
): Promise<InputError | PaymentMethod.Card | void> {
  if (!isSubscriptionPlan(planId)) {
    return;
  }

  const err = (message: string) => makeInputError<FIELD>(message, fieldName);
  const result = await paymentSubformHandle.confirmSetup(clientSecret);

  if (isErr(result)) {
    return err(result.reason);
  }

  const paymentMethod = result?.setupIntent?.payment_method;

  if (!isObject(paymentMethod)) {
    return err('Invalid response from Stripe: non-object setupIntent.payment_method');
  }

  const { card } = paymentMethod;

  if (!card) {
    return err('Invalid response from Stripe: No card data');
  }

  const storeResult = await storeCardDescription(card);

  if (isErr(storeResult)) {
    return err('Failed to store card description');
  }

  return card;
}

async function storeCardDescription(card: Card): Promise<Result<void>> {
  const request: StoreCardRequestData = {
    brand: card.brand,
    last4: card.last4,
    exp_month: card.exp_month.toString(),
    exp_year: card.exp_year.toString(),
  };

  const response = await asyncAttempt(() =>
    sendApiRequest<StripeKeysResponseData>(ApiPath.storeStripeCardDescription, HttpMethod.POST, request)
  );

  if (isErr(response)) {
    return response;
  }

  if (isAppError(response) || isInputError(response)) {
    return makeErr(response.message);
  }
}

export async function getPlanOptionLabel(planIdString: string): Promise<Result<string>> {
  const planId = makePlanId(planIdString);

  if (isErr(planId)) {
    reportAppError(si`Invalid Plan ID in ${buildPlanDropdownOptions.name}: "${planIdString}"`);
    return makeErr('Error in Plan dropdown: Invalid plan ID');
  }

  const centAmountForPlan = await getCentAmountForPlan(planId);

  if (isErr(centAmountForPlan)) {
    reportAppError(si`Failed to ${getCentAmountForPlan.name}: "${centAmountForPlan.reason}"`);
    return makeErr('Error in Plan dropdown: Failed to get plan price');
  }

  const title = Plans[planId].title;

  return formatPlanTitleAndPrice(title, centAmountForPlan);
}

export function formatPlanTitleAndPrice(planTitle: string, centAmountForPlan: number): string {
  const priceInDollars = centAmountForPlan / 100;

  return planTitle + ' • $' + priceInDollars;
}

export async function buildPlanDropdownOptions(selectedPlanId: string): Promise<Result<HTMLOptionElement[]>> {
  const options: HTMLOptionElement[] = [];

  for (const [id] of Object.entries(Plans)) {
    if (!isSubscriptionPlan(id)) {
      continue;
    }

    const optionLabel = await getPlanOptionLabel(id);

    if (isErr(optionLabel)) {
      return optionLabel;
    }

    const option = createElement('option', optionLabel, { value: id });

    if (id === selectedPlanId) {
      option.selected = true;
    }

    options.push(option);
  }

  return options;
}
