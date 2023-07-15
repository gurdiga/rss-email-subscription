import { isErr } from '../shared/lang';
import { displayInitError, hideElement, isAuthenticated, requireUiElements } from './shared';

function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    cta: '#cta',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  if (isAuthenticated()) {
    hideElement(uiElements.cta);
  }
}

interface RequiredUiElements {
  cta: HTMLElement;
}

main();
