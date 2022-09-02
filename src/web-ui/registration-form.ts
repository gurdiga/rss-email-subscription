// NOTE:
// This is the script that will be injected into blogger’s pages and is
// intended to be self-contained, that’s why no imports.
(function () {
  function main() {
    findScripts().forEach((script, index) => {
      if (isInitialized(script)) {
        return;
      }

      const { dataset } = script;
      const { feedId } = dataset;

      if (!feedId) {
        console.error('RES init error: data-feed-id is missing');
        return;
      }

      const {
        fieldLabelText,
        fieldLabelClassName,
        fieldPlaceholder,
        fieldTextboxClassName,
        buttonClassName,
        buttonLabel,
      } = dataset;

      const uiContainer = createUiContainer();
      const formArea = createFormArea();
      const fieldLabel = createFieldLabel(index, fieldLabelText, fieldLabelClassName);
      const fieldTextbox = createFieldTextbox(index, fieldPlaceholder, fieldTextboxClassName);
      const submitButton = createSubmitButton(buttonClassName, buttonLabel);
      const messageArea = createMessageArea();
      const messageContent = createMessageContent();

      const { origin } = new URL(script.src);

      setupFormSending(feedId, submitButton, fieldTextbox, messageContent, origin);
      formArea.append(fieldLabel, fieldTextbox, submitButton);
      messageArea.append(messageContent);
      uiContainer.append(formArea, messageArea);

      script.insertAdjacentElement('afterend', uiContainer);
      markAsInitialized(script);
    });
  }

  function isInitialized(script: HTMLScriptElement): boolean {
    const { dataAttrName, dataAttrValue } = isInitialized;

    return script.dataset[dataAttrName] === dataAttrValue;
  }

  isInitialized.dataAttrName = 'isInitialized';
  isInitialized.dataAttrValue = 'true';

  function markAsInitialized(script: HTMLScriptElement): void {
    const { dataAttrName, dataAttrValue } = isInitialized;

    script.dataset[dataAttrName] = dataAttrValue;
  }

  function setupFormSending(
    feedId: string,
    submitButton: HTMLButtonElement,
    fieldTextbox: HTMLInputElement,
    messageContent: HTMLElement,
    origin: string
  ) {
    const submitForm = () => {
      const data = {
        feedId,
        emailAddressText: fieldTextbox.value,
      };

      const displayMessage = (message: string) => {
        messageContent.textContent = message;
      };

      const clearField = () => {
        fieldTextbox.value = '';
      };

      preventDoubleClick(submitButton, () => submitEmailToApi(origin, data, displayMessage, clearField));
    };

    const ifKey = (key: string, handler: () => void) => {
      return (event: KeyboardEvent) => {
        if (event.key === key) {
          handler();
        }
      };
    };

    submitButton.addEventListener('click', submitForm);
    fieldTextbox.addEventListener('keypress', ifKey('Enter', submitForm));
  }

  function createUiContainer(): HTMLDivElement {
    return createElement('div', { className: 'res-ui-containter' });
  }

  function createFormArea(): HTMLDivElement {
    return createElement('div', { className: 'res-form-area' });
  }

  function createFieldLabel(index: number, textContent?: string, className?: string): HTMLLabelElement {
    return createElement('label', {
      htmlFor: fieldId(index),
      textContent: textContent || 'Subscribe to receive new posts:',
      className: className || '',
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
      className: className || '',
    });
  }

  function createSubmitButton(className?: string, buttonLabel?: string): HTMLButtonElement {
    return createElement(
      'button',
      {
        className: className || '',
      },
      buttonLabel || 'Submit'
    );
  }

  function createMessageArea(): HTMLDivElement {
    return createElement('div', { className: 'res-message-area' });
  }

  function createMessageContent(): HTMLElement {
    return createElement('small');
  }

  function findScripts(): HTMLScriptElement[] {
    return [...document.querySelectorAll<HTMLScriptElement>('script[res-registration-form]')];
  }

  function fieldId(index: number): string {
    return `res-email-${index}`;
  }

  function preventDoubleClick(button: HTMLButtonElement, f: () => Promise<void>): void {
    const initialTextContent = button.textContent;

    button.disabled = true;
    button.textContent = 'Wait…';

    f().then(() => {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = initialTextContent;
      }, 500);
    });
  }

  // Type definition copied from lib.dom.d.ts
  function createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    props: Partial<HTMLElementTagNameMap[K]> = {},
    ...children: (string | Node)[]
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

    element.append(...children);

    return element;
  }

  interface DataToSubmit {
    feedId: string;
    emailAddressText: string;
  }

  function submitEmailToApi(
    origin: string,
    data: DataToSubmit,
    displayMessage: (message: string) => void,
    clearField: () => void
  ): Promise<void> {
    const url = `${origin}/subscribe`;
    const formData = new URLSearchParams({
      feedId: data.feedId,
      email: data.emailAddressText,
    });

    const handleApiResponse = async (response: Response): Promise<void> => {
      try {
        const { message, kind } = await response.json();

        displayMessage(message);

        if (kind === 'Success') {
          clearField();
        }
      } catch (error) {
        console.error(error);
        displayMessage(`Error: invalid response from the server! Please try again.`);
      }
    };

    const handleError = (error: Error) => {
      let { message } = error;

      if (message === 'Failed to fetch') {
        message = 'Can’t connect to the server! Please try again.';
      }

      displayMessage(`Error: ${message} 😢`);
    };

    return fetch(url, { method: 'POST', body: formData }).then(handleApiResponse).catch(handleError);
  }

  main();
})();
