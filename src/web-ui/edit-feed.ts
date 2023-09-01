import { ApiPath } from '../domain/api-path';
import {
  EditFeedRequestData,
  EditFeedResponse,
  UiFeed,
  customSubjectMaxLength,
  defaultExcerptWordCount,
  isFullItemText,
  isItemTitle,
  makeFeedEmailBodySpec,
  makeFeedEmailSubjectSpec,
  maxExcerptWordCount,
  minExcerptWordCount,
} from '../domain/feed';
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
  unhideElement,
} from './shared';
import {
  FeedEmailBodyFields,
  FeedEmailSubjectFields,
  UiFeedFormFields,
  makeEmailBodySpecFromFromFields,
  makeEmailSubjectSpecFromFromFields,
  uiFeedFormFields,
} from './feed-form-shared';

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
  bindBodySpecField(uiElements);
  displayBreadcrumbs(uiElements, [
    feedListBreadcrumbsLink,
    makeFeedManageBreadcrumbsLink(uiFeed.displayName, feedId),
    { label: uiElements.pageTitle.textContent! },
  ]);
}

function bindBodySpecField(uiElements: FeedEmailBodyFields): void {
  const { emailBodyExcerptOnly, emailBodyExcerptWordCount } = uiElements;

  emailBodyExcerptOnly.addEventListener('change', () => {
    if (emailBodyExcerptOnly.checked) {
      emailBodyExcerptWordCount.focus();
      emailBodyExcerptWordCount.select();
    }
  });
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

    const requestData = makeEditFeedRequestData(uiElements, feedId);

    if (isErr(requestData)) {
      displayValidationError(requestData, uiElements);
      return;
    }

    const response = await asyncAttempt(() =>
      sendApiRequest<EditFeedResponse>(ApiPath.editFeed, HttpMethod.POST, requestData)
    );

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
  const { displayName, url, id, replyTo } = uiElements;

  displayName.value = uiFeed.displayName;
  url.value = uiFeed.url;
  id.value = uiFeed.id;
  replyTo.value = uiFeed.replyTo;

  const fillEmailBodyResult = fillEmailBodyField(uiElements, uiFeed.emailBodySpec);

  if (isErr(fillEmailBodyResult)) {
    return fillEmailBodyResult;
  }

  const fillEmailSubjectResult = fillEmailSubjectField(uiElements, uiFeed.emailSubjectSpec);

  if (isErr(fillEmailSubjectResult)) {
    return fillEmailSubjectResult;
  }
}

function fillEmailSubjectField(uiElements: FeedEmailSubjectFields, spec: UiFeed['emailSubjectSpec']): Result<void> {
  const emailSubjectSpec = makeFeedEmailSubjectSpec(spec);

  if (isErr(emailSubjectSpec)) {
    return emailSubjectSpec;
  }

  const { emailSubjectPostTitle, emailSubjectCustom, emailSubjectCustomText } = uiElements;

  if (isItemTitle(emailSubjectSpec)) {
    emailSubjectPostTitle.checked = true;
  } else {
    emailSubjectCustom.checked = true;
    emailSubjectCustomText.value = emailSubjectSpec.text;
  }

  emailSubjectCustomText.maxLength = customSubjectMaxLength;
}

function fillEmailBodyField(uiElements: FeedEmailBodyFields, spec: UiFeed['emailBodySpec']): Result<void> {
  const emailBodySpec = makeFeedEmailBodySpec(spec);

  if (isErr(emailBodySpec)) {
    return emailBodySpec;
  }

  const { emailBodyFullPost, emailBodyExcerptOnly, emailBodyExcerptWordCount } = uiElements;

  emailBodyExcerptWordCount.valueAsNumber = defaultExcerptWordCount;

  if (isFullItemText(emailBodySpec)) {
    emailBodyFullPost.checked = true;
  } else {
    emailBodyExcerptOnly.checked = true;
    emailBodyExcerptWordCount.valueAsNumber = emailBodySpec.wordCount;
  }

  emailBodyExcerptWordCount.max = maxExcerptWordCount.toString();
  emailBodyExcerptWordCount.min = minExcerptWordCount.toString();
}

function makeEditFeedRequestData(formFields: UiFeedFormFields, initialId: FeedId): Result<EditFeedRequestData> {
  const emailBodySpec = makeEmailBodySpecFromFromFields(formFields);

  if (isErr(emailBodySpec)) {
    return emailBodySpec;
  }

  const emailSubjectSpec = makeEmailSubjectSpecFromFromFields(formFields);

  if (isErr(emailSubjectSpec)) {
    return emailSubjectSpec;
  }

  const requestData: EditFeedRequestData = {
    displayName: formFields.displayName.value,
    id: formFields.id.value,
    emailBodySpec,
    emailSubjectSpec,
    initialId: initialId.value,
    url: formFields.url.value,
    replyTo: formFields.replyTo.value,
  };

  return requestData;
}

interface RequiredUiElements extends UiFeedFormFields, ApiResponseUiElements, BreadcrumbsUiElements, SpinnerUiElements {
  form: HTMLFormElement;
  submitButton: HTMLButtonElement;
}

interface RequiredParams {
  id: string;
}

typeof window !== 'undefined' && main();
