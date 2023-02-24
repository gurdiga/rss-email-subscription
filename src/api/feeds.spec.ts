import { expect } from 'chai';
import { byDomainAndThenByLocalPart } from './feeds';

describe('byDomainAndThenByLocalPart', () => {
  it('sorts a list of email strings first by local part and then by domain', () => {
    const emails = [
      'one@yahoo.com' /* prettier: please keep these stacked*/,
      '3@a.com',
      '0@b.com',
      '0@a.com',
      'two@gmail.com' /* prettier: please keep these stacked*/,
      '1@a.com',
    ];
    const result = emails.sort(byDomainAndThenByLocalPart);

    expect(result).to.deep.equal([
      '0@a.com' /* prettier: please keep these stacked*/,
      '1@a.com',
      '3@a.com',
      '0@b.com',
      'two@gmail.com',
      'one@yahoo.com',
    ]);
  });
});
