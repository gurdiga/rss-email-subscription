import uaParser from 'ua-parser-js';
import { expect } from 'chai';

describe('uaParser', () => {
  it('works', () => {
    expect(uaParser('')).to.deep.equal({
      browser: {
        major: undefined,
        name: undefined,
        version: undefined,
      },
      cpu: {
        architecture: undefined,
      },
      device: {
        model: undefined,
        type: undefined,
        vendor: undefined,
      },
      engine: {
        name: undefined,
        version: undefined,
      },
      os: {
        name: undefined,
        version: undefined,
      },
      ua: '',
    });

    // navigator.userAgent
    let input =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

    expect(uaParser(input)).to.deep.equal({
      browser: {
        major: '119',
        name: 'Chrome',
        version: '119.0.0.0',
      },
      cpu: {
        architecture: undefined,
      },
      device: {
        model: 'Macintosh',
        type: undefined,
        vendor: 'Apple',
      },
      engine: {
        name: 'Blink',
        version: '119.0.0.0',
      },
      os: {
        name: 'Mac OS',
        version: '10.15.7',
      },
      ua: input,
    });

    input =
      'Mozilla/5.0 (iPad; CPU OS 15_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/19A348 [FBAN/FBIOS;FBAV/439.1.0.36.116;FBBV/532746663;FBDV/iPad7,2;FBMD/iPad;FBSN/iPadOS;FBSV/15.0.1;FBSS/2;FBID/tablet;FBLC/it_IT;FBOP/5;FBRV/533785113]';

    expect(uaParser(input)).to.deep.equal({
      browser: {
        major: '439',
        name: 'Facebook',
        version: '439.1.0.36.116',
      },
      cpu: {
        architecture: undefined,
      },
      device: {
        model: 'iPad',
        type: 'tablet',
        vendor: 'Apple',
      },
      engine: {
        name: 'WebKit',
        version: '605.1.15',
      },
      os: {
        name: 'iOS',
        version: '15.0.1',
      },
      ua: input,
    });
  });
});
