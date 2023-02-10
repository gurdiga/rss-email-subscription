export function createElement(
  tagName: keyof HTMLElementTagNameMap,
  textContent: string,
  attributes?: Record<string, string>
): HTMLElement;
export function createElement(tagName: keyof HTMLElementTagNameMap): HTMLElement;
export function createElement(
  tagName: keyof HTMLElementTagNameMap,
  textContent?: string,
  attributes?: Record<string, string>
): HTMLElement {
  const element = document.createElement(tagName);

  if (textContent) {
    element.textContent = textContent;
  }

  if (attributes) {
    for (const [attrName, attrValue] of Object.entries(attributes)) {
      element.setAttribute(attrName, attrValue);
    }
  }

  return element;
}

export function insertAdjacentElement(
  referenceElement: Element,
  insertPosition: InsertPosition,
  newElement: HTMLElement
) {
  referenceElement.insertAdjacentElement(insertPosition, newElement);
}

export function querySelector(selector: string) {
  return document.querySelector(selector);
}
