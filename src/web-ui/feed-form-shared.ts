import {
  UiFeed,
  makeCustomSubjectString,
  makeFullItemTextString,
  makeItemExcerptWordCountString,
  makeItemTitleString,
} from '../domain/feed';
import { Result, isErr, makeErr, makePositiveInteger } from '../shared/lang';

export interface UiFeedFormFields extends FeedEmailBodyFields, FeedEmailSubjectFields {
  displayName: HTMLInputElement;
  url: HTMLInputElement;
  id: HTMLInputElement;
  replyTo: HTMLInputElement;
}

export interface FeedEmailBodyFields {
  emailBodyFullPost: HTMLInputElement;
  emailBodyExcerptOnly: HTMLInputElement;
  emailBodyExcerptWordCount: HTMLInputElement;
}

export function makeEmailBodySpecFromFromFields(
  formFields: FeedEmailBodyFields,
  field = 'emailBodySpec'
): Result<UiFeed['emailBodySpec']> {
  if (formFields.emailBodyFullPost.checked) {
    return makeFullItemTextString();
  } else if (formFields.emailBodyExcerptOnly.checked) {
    const field: keyof FeedEmailBodyFields = 'emailBodyExcerptWordCount';
    const wordCount = makePositiveInteger(formFields.emailBodyExcerptWordCount.value, field);

    if (isErr(wordCount)) {
      return wordCount;
    }

    return makeItemExcerptWordCountString(wordCount);
  } else {
    return makeErr('Invalid emailBodySpec state', field);
  }
}

export interface FeedEmailSubjectFields {
  emailSubjectPostTitle: HTMLInputElement;
  emailSubjectCustom: HTMLInputElement;
  emailSubjectCustomText: HTMLInputElement;
}

export function makeEmailSubjectSpecFromFromFields(
  formFields: FeedEmailSubjectFields,
  field = 'emailTitleSpec'
): Result<UiFeed['emailSubjectSpec']> {
  if (formFields.emailSubjectPostTitle.checked) {
    return makeItemTitleString();
  } else if (formFields.emailSubjectCustom.checked) {
    return makeCustomSubjectString(formFields.emailSubjectCustomText.value);
  } else {
    return makeErr('Invalid emailSubjectSpec state', field);
  }
}

export const uiFeedFormFields: Record<keyof UiFeedFormFields, string> = {
  displayName: '#feed-name-field',
  url: '#feed-url-field',
  id: '#feed-id-field',
  replyTo: '#feed-reply-to-field',
  emailBodyFullPost: '#email-body-full-post',
  emailBodyExcerptOnly: '#email-body-excerpt-only',
  emailBodyExcerptWordCount: '#email-body-excerpt-word-count',
  emailSubjectPostTitle: '#email-subject-post-title',
  emailSubjectCustom: '#email-subject-custom',
  emailSubjectCustomText: '#email-subject-custom-text',
};
