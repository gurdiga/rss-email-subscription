import { getRandomString } from '../shared/crypto';
import { FeedHashingSalt, feedHashingSaltLength } from './feed';

export function makeNewFeedHashingSalt(): FeedHashingSalt {
  const salt: FeedHashingSalt = {
    kind: 'FeedHashingSalt',
    value: getRandomString(feedHashingSaltLength),
  };

  return salt;
}
