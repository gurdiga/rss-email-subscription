/// <reference path="../../node_modules/@stripe/stripe-js/types/stripe-js/index.d.ts" />

import { StripeConstructor } from '../../node_modules/@stripe/stripe-js/types/stripe-js/stripe';
import { si } from '../shared/string-utils';
import { createElement } from './dom-isolation';

async function main() {
  const Stripe = await loadStripeJs();

  const publishableKey =
    location.hostname === 'localhost.feedsubscription.com'
      ? 'pk_test_51MvdmxFR3kYE4CA0Lt5kD0JPFPL9ddsNVQW0zG4T9Ni90Rc5Uxt3iQIjMxHzA5IXAUqULCSL22pHkYIYuKdM9O8900PN3Z38S7'
      : 'pk_live_51MvdmxFR3kYE4CA0tWqey4CQLbu5swCFi55fXYha1z6TXyqkQX21zV0knPChTfPCylYJNyRE37KANv3SN6P6OefY00l4YHt9sG';

  const stripe = Stripe(publishableKey);
  const elements = stripe.elements();

  console.log({ elements });
}

async function loadStripeJs(): Promise<StripeConstructor> {
  return new Promise((resolve, reject) => {
    const src = 'https://js.stripe.com/v3/';
    const script = createElement('script', '', { src });

    script.onload = () => resolve((window as any).Stripe);
    script.onerror = () => reject(new Error(si`Failed to load Stripe.js from ${script.src}`));

    document.head.append(script);
  });
}

main();
