(function () {
  function main() {
    /**
     * Layouts:
     *
     * - Horizontal:
     * Subscribe to new posts: ____________ [SUBMIT]
     * “Success! Welcome aboard!”
     *
     * - Vertical:
     * Subscribe to new posts:
     * ____________
     * [SUBMIT]
     * “Success! Welcome aboard!”
     *
     */

    findScripts().forEach((script, index) => {
      if (script.dataset['isInitialized'] === 'true') {
        return;
      }

      const { fieldLabelText, fieldLabelClassName, fieldPlaceholder, fieldTextboxClassName, buttonClassName } =
        script.dataset;

      const uiContainer = createUiContainer();
      const formArea = createFormArea();
      const fieldLabel = createFieldLabel(index, fieldLabelText, fieldLabelClassName);
      const fieldTextbox = createFieldTextbox(index, fieldPlaceholder, fieldTextboxClassName);
      const submitButton = createSubmitButton(buttonClassName); // TODO: Add click handler
      const messageArea = createMessageArea();
      const messageContent = createMessageContent();

      formArea.append(fieldLabel, fieldTextbox, submitButton);
      messageArea.append(messageContent);
      uiContainer.append(formArea, messageArea);

      script.insertAdjacentElement('afterend', uiContainer);
      script.dataset['isInitialized'] = 'true';
    });
  }

  main();

  function createUiContainer(): HTMLDivElement {
    const div = createElement('div');

    div.className = 'res-ui-containter';

    return div;
  }

  function createFormArea(): HTMLDivElement {
    const div = createElement('div');

    div.className = 'res-form-area';

    return div;
  }

  function createFieldLabel(index: number, textContent?: string, className?: string): HTMLLabelElement {
    const label = createElement('label');

    label.htmlFor = fieldId(index);
    label.textContent = textContent || 'Subscribe to new posts:';
    label.style.marginRight = '0.5em';

    addClassName(label, className);

    return label;
  }

  function createFieldTextbox(index: number, placeholder?: string, className?: string): HTMLInputElement {
    const input = createElement('input');

    input.id = fieldId(index);
    input.name = 'email'; // trigger appropriate auto-complete
    input.placeholder = placeholder || 'your@email.com';
    input.style.marginRight = '0.25em';

    addClassName(input, className);

    return input;
  }

  function fieldId(index: number): string {
    return `res-email-${index}`;
  }

  function createSubmitButton(className?: string): HTMLInputElement {
    const button = createElement('input');

    button.type = 'submit';

    addClassName(button, className);

    return button;
  }

  function createMessageArea(): HTMLDivElement {
    const div = createElement('div');

    div.className = 'res-message-area';

    return div;
  }

  function createMessageContent(): HTMLElement {
    const message = createElement('small');

    message.style.fontStyle = 'italic';

    return message;
  }

  function findScripts(): HTMLScriptElement[] {
    return [...document.querySelectorAll<HTMLScriptElement>('script[res-app]')];
  }

  // Type definition copied from lib.dom.d.ts
  function createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
    return document.createElement(tagName);
  }

  function addClassName(element: HTMLElement, className?: string): void {
    const classNames = (className || '')
      .trim()
      .split(/\s+/)
      .filter((x) => !!x.trim());

    if (classNames.length > 0) {
      element.classList.add(...classNames);
    }
  }
})();
