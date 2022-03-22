export interface ConfirmationLinkUrlParams {
  id: string;
  displayName: string;
  email: string;
}

export function parseConfirmationLinkUrlParams(locationSearch: string): ConfirmationLinkUrlParams {
  const params = new URLSearchParams(locationSearch);

  return {
    id: params.get('id')!,
    displayName: params.get('displayName')!,
    email: params.get('email')!,
  };
}
