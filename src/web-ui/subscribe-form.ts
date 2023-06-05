import { isErr } from '../shared/lang';
import { requireUiElements, displayInitError, isAuthenticated, unhideElement, UiElementsBase } from './shared';

function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    cta: '#cta',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  if (!isAuthenticated()) {
    unhideElement(uiElements.cta);
  }
}

interface RequiredUiElements extends UiElementsBase {
  cta: HTMLElement;
}

main();
