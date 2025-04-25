import { UAParser } from 'ua-parser-js';
import { expect } from 'chai';

describe('UAParser', () => {
  it('works with empty string', () => {
    const result = UAParser('');

    expect(result.browser).to.contain({
      major: undefined,
      name: undefined,
      type: undefined,
      version: undefined,
    });

    expect(result.device).to.contain({
      model: undefined,
      type: undefined,
      vendor: undefined,
    });

    expect(result.os).to.contain({
      name: undefined,
      version: undefined,
    });
  });

  it('works with macOS Chrome', () => {
    const result = UAParser(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );

    expect(result.browser).to.contain({
      major: '119',
      name: 'Chrome',
      type: undefined,
      version: '119.0.0.0',
    });

    expect(result.device).to.contain({
      model: 'Macintosh',
      type: undefined,
      vendor: 'Apple',
    });

    expect(result.os).to.contain({
      name: 'macOS',
      version: '10.15.7',
    });
  });

  it('works with iPad Facebook in-app browser', () => {
    const result = UAParser(
      'Mozilla/5.0 (iPad; CPU OS 15_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/19A348 [FBAN/FBIOS;FBAV/439.1.0.36.116;FBBV/532746663;FBDV/iPad7,2;FBMD/iPad;FBSN/iPadOS;FBSV/15.0.1;FBSS/2;FBID/tablet;FBLC/it_IT;FBOP/5;FBRV/533785113]'
    );

    expect(result.browser).to.contain({
      major: '439',
      name: 'Facebook',
      version: '439.1.0.36.116',
    });

    expect(result.device).to.contain({
      model: 'iPad',
      type: 'tablet',
      vendor: 'Apple',
    });

    expect(result.os).to.contain({
      name: 'iOS',
      version: '15.0.1',
    });
  });
});
