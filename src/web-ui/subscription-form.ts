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
      const styleSheet = createStyleSheet();

      const { origin } = new URL(script.src);

      setupFormSending(feedId, submitButton, fieldTextbox, messageContent, new URL(origin));
      formArea.append(fieldLabel, fieldTextbox, submitButton);
      messageArea.append(messageContent);
      uiContainer.append(formArea, messageArea, styleSheet);

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

  type MessageType = 'success' | 'failure' | 'empty';

  function setupFormSending(
    feedId: string,
    submitButton: HTMLButtonElement,
    fieldTextbox: HTMLInputElement,
    messageContent: HTMLElement,
    origin: URL
  ) {
    const submitForm = () => {
      const data = {
        feedId,
        emailAddressText: fieldTextbox.value,
      };

      const displayMessage = (message: string, type: MessageType) => {
        messageContent.textContent = message;
        messageContent.setAttribute('type', type);
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
      textContent: textContent || 'Get new posts in your inbox:',
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
        style: <CSSStyleDeclaration>{
          margin: '0.25em 0',
        },
        className: className || '',
      },
      buttonLabel || 'Submit'
    );
  }

  function createMessageArea(): HTMLDivElement {
    return createElement('div', { className: 'res-message-area' });
  }

  function createMessageContent(): HTMLElement {
    return createElement('p', { className: 'res-message' });
  }

  function createStyleSheet(): HTMLStyleElement {
    return createElement(
      'style',
      {},
      `
    .res-message:empty {
      display: none;
    }
    .res-message {
      margin: 0;
      padding: .25em .5em;
      border: 1px solid;
      border-radius: .25em;
    }
    .res-message[type="success"] {
      color: #0f5132;
      border-color: #badbcc;
      background-color: #d1e7dd;
    }
    .res-message[type="failure"] {
      color: #842029;
      border-color: #f5c2c7;
      background-color: #f8d7da;
    }
    `
    );
  }

  function findScripts(): HTMLScriptElement[] {
    return [...document.querySelectorAll<HTMLScriptElement>('script[res-subscription-form]')];
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

  async function submitEmailToApi(
    origin: URL,
    data: DataToSubmit,
    displayMessage: (message: string, type: MessageType) => void,
    clearField: () => void
  ): Promise<void> {
    displayMessage('', 'empty');

    const url = new URL(`/api/subscription`, origin);
    const formData = new URLSearchParams({
      feedId: data.feedId,
      email: data.emailAddressText,
      source: location.href,
    });

    return fetch(url, { method: 'POST', body: formData }).then(handleApiResponse).catch(handleError);

    async function handleApiResponse(response: Response): Promise<void> {
      try {
        const { message, kind } = await response.json();

        displayMessage(message, kind === 'Success' ? 'success' : 'failure');

        if (kind === 'Success') {
          clearField();
        }
      } catch (error) {
        console.error(error);
        displayMessage('Error: invalid response from the server! Please try again.', 'failure');
      }
    }

    function handleError(error: Error): void {
      let { message } = error;

      if (message === 'Failed to fetch') {
        message = 'Failed to connect to the server. Please try again in a few moments.';
      }

      displayMessage(`Error: ${message} 😢`, 'failure');
    }
  }

  main();
})();
