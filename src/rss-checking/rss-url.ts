interface ValidRssUrl {
  kind: 'ValidRssUrl';
  value: URL;
}

export interface InvalidRssUrl {
  kind: 'InvalidRssUrl';
  reason: string;
}

export function makeRssUrl(url?: string): ValidRssUrl | InvalidRssUrl {
  if (!url) {
    return {
      kind: 'InvalidRssUrl',
      reason: 'Missing URL string',
    };
  }

  try {
    return {
      kind: 'ValidRssUrl',
      value: new URL(url),
    };
  } catch (e) {
    return {
      kind: 'InvalidRssUrl',
      reason: e.message,
    };
  }
}
