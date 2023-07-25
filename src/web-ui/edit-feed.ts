import { ApiPath } from '../domain/api-path';
import { EditFeedRequestData, EditFeedResponse, UiFeed, makeFeedEmailBodySpec } from '../domain/feed';
import { FeedId, makeFeedId } from '../domain/feed-id';
import { FeedManageParams, PagePath, makePagePathWithParams } from '../domain/page-path';
import { isAppError, isInputError, isSuccess } from '../shared/api-response';
import { Result, asyncAttempt, isErr, makeErr } from '../shared/lang';
import { si } from '../shared/string-utils';
import {
  BreadcrumbsUiElements,
  breadcrumbsUiElements,
  displayBreadcrumbs,
  feedListBreadcrumbsLink,
  makeFeedManageBreadcrumbsLink,
} from './breadcrumbs';
import {
  ApiResponseUiElements,
  HttpMethod,
  SpinnerUiElements,
  UiFeedFormFields,
  apiResponseUiElements,
  clearValidationErrors,
  displayApiResponse,
  displayCommunicationError,
  displayInitError,
  displayValidationError,
  navigateTo,
  onSubmit,
  requireQueryParams,
  requireUiElements,
  sendApiRequest,
  spinnerUiElements,
  uiFeedFormFields,
  unhideElement,
} from './shared';

async function main() {
  const queryStringParams = requireQueryParams<RequiredParams>({
    id: 'id',
  });

  if (isErr(queryStringParams)) {
    displayInitError(queryStringParams.reason);
    return;
  }

  const feedId = makeFeedId(queryStringParams.id);

  if (isErr(feedId)) {
    displayInitError(si`Invalid feed ID: ${feedId.reason}`);
    return;
  }

  const uiElements = requireUiElements<RequiredUiElements>({
    form: '#edit-form',
    ...uiFeedFormFields,
    ...breadcrumbsUiElements,
    ...spinnerUiElements,
    ...apiResponseUiElements,
    submitButton: '#submit-button',
  });

  if (isErr(uiElements)) {
    displayInitError(uiElements.reason);
    return;
  }

  const uiFeed = await loadUiFeed(feedId);

  uiElements.spinner.remove();

  if (isErr(uiFeed)) {
    displayInitError(uiFeed.reason);
    return;
  }

  const fillFormResult = fillForm(uiElements, uiFeed);

  if (isErr(fillFormResult)) {
    displayInitError(fillFormResult.reason);
    return;
  }

  unhideElement(uiElements.form);
  bindSubmitButton(uiElements, feedId);
  displayBreadcrumbs(uiElements, [
    feedListBreadcrumbsLink,
    makeFeedManageBreadcrumbsLink(uiFeed.displayName, feedId),
    { label: uiElements.pageTitle.textContent! },
  ]);
}

export async function loadUiFeed<T = UiFeed>(feedId: FeedId): Promise<Result<T>> {
  const response = await asyncAttempt(() =>
    sendApiRequest<T>(ApiPath.loadFeedById, HttpMethod.GET, { feedId: feedId.value })
  );

  if (isErr(response)) {
    return makeErr('Failed to load the feed');
  }

  if (isAppError(response)) {
    return makeErr(response.message);
  }

  if (isInputError(response)) {
    return makeErr('Input error when loading the feed');
  }

  return response.responseData!;
}

function bindSubmitButton(uiElements: RequiredUiElements, feedId: FeedId): void {
  onSubmit(uiElements.submitButton, async (event: Event) => {
    event.preventDefault();
    clearValidationErrors(uiElements);

    const response = await submitForm(uiElements, feedId);

    if (isErr(response)) {
      displayCommunicationError(response, uiElements.apiResponseMessage);
      return;
    }

    if (isAppError(response)) {
      displayApiResponse(response, uiElements.apiResponseMessage);
      return;
    }

    if (isInputError(response)) {
      displayValidationError(response, uiElements);
      return;
    }

    if (isSuccess(response)) {
      displayApiResponse(response, uiElements.apiResponseMessage);

      setTimeout(() => {
        const newFeedId = response.responseData?.feedId!;
        const oldFeedId = feedId.value;

        const nextPageParams: FeedManageParams = {
          id: newFeedId,
          idChanged: newFeedId !== oldFeedId ? 'true' : 'false',
        };

        const nextPage = makePagePathWithParams<FeedManageParams>(PagePath.feedManage, nextPageParams);

        navigateTo(nextPage);
      }, 1000);
    }
  });
}

function fillForm(uiElements: UiFeedFormFields, uiFeed: UiFeed): Result<void> {
  uiElements.displayName.value = uiFeed.displayName;
  uiElements.url.value = uiFeed.url;
  uiElements.id.value = uiFeed.id;
  uiElements.replyTo.value = uiFeed.replyTo;

  const emailBodySpec = makeFeedEmailBodySpec(uiFeed.emailBodySpec);

  if (isErr(emailBodySpec)) {
    return emailBodySpec;
  }

  if (emailBodySpec.kind === 'FullItemText') {
    uiElements.emailBodyFullPost.checked = true;
  } else {
    uiElements.emailBodyExcerptOnly.checked = true;
    uiElements.emailBodyExcerptWordCount.valueAsNumber = emailBodySpec.wordCount;
  }
}

async function submitForm(formFields: UiFeedFormFields, initialId: FeedId) {
  const editFeedRequest: EditFeedRequestData = {
    displayName: formFields.displayName.value,
    id: formFields.id.value,
    initialId: initialId.value,
    url: formFields.url.value,
    replyTo: formFields.replyTo.value,
  };

  return await asyncAttempt(() => sendApiRequest<EditFeedResponse>(ApiPath.editFeed, HttpMethod.POST, editFeedRequest));
}

interface RequiredUiElements extends UiFeedFormFields, ApiResponseUiElements, BreadcrumbsUiElements, SpinnerUiElements {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
}

interface RequiredParams {
  id: string;
}

typeof window !== 'undefined' && main();
