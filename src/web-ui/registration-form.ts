(function () {
  function main() {
    /**
     * Subscribe to new posts: ____________ [SUBMIT]
     * _Success! Welcome aboard!_
     */

    findScripts().forEach((script, index) => {
      const { dataset } = script;

      if (dataset['isInitialized'] === 'true') {
        return;
      }

      const { fieldLabelText, fieldLabelClassName, fieldPlaceholder, fieldTextboxClassName, buttonClassName } = dataset;

      const uiContainer = createUiContainer();
      const formArea = createFormArea();
      const fieldLabel = createFieldLabel(index, fieldLabelText, fieldLabelClassName);
      const fieldTextbox = createFieldTextbox(index, fieldPlaceholder, fieldTextboxClassName);
      const submitButton = createSubmitButton(buttonClassName); // TODO: Add click handler
      const messageArea = createMessageArea();
      const messageContent = createMessageContent();

      // submitButton.addEventListener('click', () => submitEmailToApi(fieldTextbox.value));

      formArea.append(fieldLabel, fieldTextbox, submitButton);
      messageArea.append(messageContent);
      uiContainer.append(formArea, messageArea);

      script.insertAdjacentElement('afterend', uiContainer);
      dataset['isInitialized'] = 'true';
    });
  }

  main();

  function createUiContainer(): HTMLDivElement {
    return createElement('div', {
      className: 'res-ui-containter',
    });
  }

  function createFormArea(): HTMLDivElement {
    return createElement('div', {
      className: 'res-form-area',
    });
  }

  function createFieldLabel(index: number, textContent?: string, className?: string): HTMLLabelElement {
    return createElement('label', {
      htmlFor: fieldId(index),
      textContent: textContent || 'Subscribe to new posts:',
      className: className,
      style: <CSSStyleDeclaration>{
        marginRight: '0.5em',
      },
    });
  }

  function createFieldTextbox(index: number, placeholder?: string, className?: string): HTMLInputElement {
    return createElement('input', {
      id: fieldId(index),
      name: 'email', // trigger appropriate auto-complete
      placeholder: placeholder || 'your@email.com',
      style: <CSSStyleDeclaration>{
        marginRight: '0.25em',
      },
      className: className,
    });
  }

  function createSubmitButton(className?: string): HTMLInputElement {
    return createElement('input', {
      type: 'submit',
      className: className,
    });
  }

  function createMessageArea(): HTMLDivElement {
    return createElement('div', {
      className: 'res-message-area',
    });
  }

  function createMessageContent(): HTMLElement {
    return createElement('small', {
      style: <CSSStyleDeclaration>{
        fontStyle: 'italic',
      },
    });
  }

  function findScripts(): HTMLScriptElement[] {
    return [...document.querySelectorAll<HTMLScriptElement>('script[res-app]')];
  }

  function fieldId(index: number): string {
    return `res-email-${index}`;
  }

  // Type definition copied from lib.dom.d.ts
  function createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    props: Partial<HTMLElementTagNameMap[K]> = {}
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tagName);

    for (const propName in props) {
      const propValue = props[propName];

      if (propName === 'style') {
        Object.assign(element.style, propValue);
      } else {
        element[propName] = propValue!;
      }
    }

    return element;
  }
})();
