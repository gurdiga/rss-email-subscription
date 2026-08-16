import { expect } from 'chai';
import { isAllowedHost, isPublicIpAddress } from './address-guard';

describe(isPublicIpAddress.name, () => {
  it('accepts public IPv4 addresses', () => {
    expect(isPublicIpAddress('93.184.216.34')).to.be.true;
    expect(isPublicIpAddress('8.8.8.8')).to.be.true;
    expect(isPublicIpAddress('172.32.0.1')).to.be.true;
    expect(isPublicIpAddress('100.63.255.255')).to.be.true;
  });

  it('rejects IPv4 addresses in special-use ranges', () => {
    const specialUseAddresses = [
      '0.0.0.0',
      '10.5.5.5',
      '127.0.0.1',
      '100.64.0.1',
      '169.254.169.254', // the cloud metadata service
      '172.16.0.1',
      '172.31.255.255',
      '192.0.0.1',
      '192.168.1.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ];

    for (const address of specialUseAddresses) {
      expect(isPublicIpAddress(address), address).to.be.false;
    }
  });

  it('accepts public IPv6 addresses', () => {
    expect(isPublicIpAddress('2606:2800:220:1:248:1893:25c8:1946')).to.be.true;
    expect(isPublicIpAddress('2001:4860:4860::8888')).to.be.true;
  });

  it('rejects IPv6 addresses in special-use ranges', () => {
    const specialUseAddresses = ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2002:7f00:1::1'];

    for (const address of specialUseAddresses) {
      expect(isPublicIpAddress(address), address).to.be.false;
    }
  });

  it('rejects IPv4 addresses embedded in IPv6 ones', () => {
    const embeddingAddresses = [
      '::ffff:10.0.0.1', // IPv4-mapped
      '::ffff:a00:1', // the same, as URL normalizes it
      '::ffff:169.254.169.254',
      '::127.0.0.1', // IPv4-compatible, deprecated
      '64:ff9b::10.0.0.1', // NAT64
    ];

    for (const address of embeddingAddresses) {
      expect(isPublicIpAddress(address), address).to.be.false;
    }

    expect(isPublicIpAddress('::ffff:93.184.216.34')).to.be.true;
  });

  it('rejects anything that is not an address', () => {
    expect(isPublicIpAddress('example.com')).to.be.false;
    expect(isPublicIpAddress('')).to.be.false;
    expect(isPublicIpAddress('fe80::1%eth0')).to.be.false;
  });
});

describe(isAllowedHost.name, () => {
  it('leaves hostnames to the lookup guard', () => {
    expect(isAllowedHost('example.com')).to.be.true;
    expect(isAllowedHost('localhost')).to.be.true;
  });

  it('rejects literal addresses in special-use ranges', () => {
    expect(isAllowedHost('127.0.0.1')).to.be.false;
    expect(isAllowedHost('169.254.169.254')).to.be.false;
    expect(isAllowedHost('[::1]')).to.be.false;
    expect(isAllowedHost('[::ffff:10.0.0.1]')).to.be.false;
  });

  it('rejects brackets that hold no address', () => {
    expect(isAllowedHost('[example.com]')).to.be.false;
    expect(isAllowedHost('[fe80::1%25eth0]')).to.be.false;
  });

  it('accepts the alternative forms of a public address', () => {
    expect(isAllowedHost('93.184.216.34')).to.be.true;
    expect(isAllowedHost(new URL('http://1560884770/').hostname)).to.be.true; // 93.9.54.34
  });
});
