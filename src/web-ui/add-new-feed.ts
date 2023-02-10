import { isErr } from '../shared/lang';
import { displayInitError, requireUiElements } from './shared';

async function main() {
  const uiElements = requireUiElements<UiElements>({
    feedNameField: '#feed-name-field',
    feedUrlField: '#feed-url-field',
    feedIdField: '#feed-id-field',
    feedReplyToField: '#feed-reply-to-field',
    submitButton: '#submit-button',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  console.log({ uiElements });
}

interface UiElements {
  feedNameField: HTMLInputElement;
  feedUrlField: HTMLInputElement;
  feedIdField: HTMLInputElement;
  feedReplyToField: HTMLInputElement;
  submitButton: HTMLButtonElement;
}

globalThis.window && main();
