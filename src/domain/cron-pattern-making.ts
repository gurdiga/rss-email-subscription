import { CronTime } from 'cron';
import { attempt, getTypeName, isErr, isString, makeErr, Result } from '../shared/lang';
import { si } from '../shared/string-utils';
import { UnixCronPattern } from './cron-pattern';

export function makeUnixCronPattern(input: unknown, field = 'cronPattern'): Result<UnixCronPattern> {
  if (!isString(input)) {
    return makeErr(si`Invalid cron pattern: expected string, got ${getTypeName(input)}`, field);
  }

  const parsed = attempt(() => new CronTime(input));

  if (isErr(parsed)) {
    return makeErr(si`Invalid cron pattern: "${input}"`, field);
  }

  // NOTE: The node-cron library supports 6-field cron patterns, and
  // here I’m stripping the first field, which is for seconds, to align
  // with the Unix® Standard® 5-field format.
  const fieldSeparator = ' '; // one space
  const value = parsed.toString().split(fieldSeparator).slice(1).join(fieldSeparator);

  return {
    kind: 'UnixCronPattern',
    value,
  };
}
