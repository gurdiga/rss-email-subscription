import { isErr } from '../shared/lang';
import { displayInitError, hideElement, isAuthenticated, requireUiElements } from './shared';

function main() {
  const uiElements = requireUiElements<RequiredUiElements>({
    ctaForm: '#cta-form',
    ctaLink: '#cta-link',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const { ctaForm, ctaLink } = uiElements;

  if (isAuthenticated()) {
    hideElement(ctaForm, ctaLink);
  }
}

interface RequiredUiElements {
  ctaForm: HTMLElement;
  ctaLink: HTMLElement;
}

main();
