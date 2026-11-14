import { expect } from 'chai';
import { makeFullItemText, makeItemTitle } from '../../domain/feed';
import { RssItem } from '../../domain/rss-item';
import { isErr } from '../../shared/lang';
import { makeItemEmailContent } from './email-content';
import { defaultItemContentWorkerLimits, makeItemEmailContentInWorker } from './item-content-worker';

describe(makeItemEmailContentInWorker.name, function () {
  // Each worker loads ts-node before it starts, which takes a second or
  // two.
  this.timeout(30_000);

  const item: RssItem = {
    title: 'A post',
    content: '<p>Some <a href="/about">text</a> and <img src="//example.com/x.png"></p>',
    author: 'Someone',
    pubDate: new Date('2026-11-09T00:00:00.000Z'),
    link: new URL('https://example.com/post.html'),
    guid: '1',
  };

  it('returns what makeItemEmailContent returns', async () => {
    const result = await makeItemEmailContentInWorker(item, makeFullItemText(), makeItemTitle());

    expect(result).to.deep.equal(makeItemEmailContent(item, makeFullItemText(), makeItemTitle()));
  });

  it('returns an Err on timeout without blocking this thread, and runs the next item', async () => {
    const nestedItem: RssItem = { ...item, content: '<div>'.repeat(100_000) };
    const limits = { ...defaultItemContentWorkerLimits, timeoutMs: 1000 };
    let tickCount = 0;
    const interval = setInterval(() => tickCount++, 100);

    const result = await makeItemEmailContentInWorker(nestedItem, makeFullItemText(), makeItemTitle(), limits);
    clearInterval(interval);

    expect(isErr(result) && result.reason).to.equal('Timed out after 1000 ms');
    expect(tickCount).to.be.above(5);

    const nextResult = await makeItemEmailContentInWorker(item, makeFullItemText(), makeItemTitle());

    expect(isErr(nextResult)).to.be.false;
  });

  it('returns an Err when the worker runs out of heap', async () => {
    const heavyItem: RssItem = { ...item, content: '<a>'.repeat(170_000) };
    const limits = { ...defaultItemContentWorkerLimits, maxOldGenerationSizeMb: 96 };

    const result = await makeItemEmailContentInWorker(heavyItem, makeFullItemText(), makeItemTitle(), limits);

    expect(isErr(result) && result.reason).to.contain('reaching memory limit');
  });
});
