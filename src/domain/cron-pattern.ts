import { hasKind } from '../shared/lang';

export interface UnixCronPattern {
  kind: 'UnixCronPattern';
  value: string;
}

export function isUnixCronPattern(value: unknown): value is UnixCronPattern {
  return hasKind(value, 'UnixCronPattern');
}

export const defaultFeedPattern: UnixCronPattern = {
  kind: 'UnixCronPattern',
  value: '0 * * * *',
};
