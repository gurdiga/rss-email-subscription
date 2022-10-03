export function createElement(tagName: keyof HTMLElementTagNameMap): HTMLElement {
  return document.createElement(tagName);
}

export function insertAdjacentElement(
  referenceElement: HTMLElement,
  insertPosition: InsertPosition,
  newElement: HTMLElement
) {
  referenceElement.insertAdjacentElement(insertPosition, newElement);
}

export function querySelector(selector: string) {
  return document.querySelector(selector);
}