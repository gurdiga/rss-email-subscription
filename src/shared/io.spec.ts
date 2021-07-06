import { expect } from 'chai';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { mkdirp, writeFile } from './io';

describe(mkdirp.name, () => {
  const tmpWorkDir = mkdtempSync(path.join(os.tmpdir(), 'res-test-mkdirp-'));

  it('creates nested directories', () => {
    const dir = `${tmpWorkDir}/one/two/three`;

    mkdirp(dir);

    expect(existsSync(dir)).to.be.true;
  });
});

describe(writeFile.name, () => {
  const tmpWorkDir = mkdtempSync(path.join(os.tmpdir(), 'res-test-writeFile-'));

  it('writes the given content to the givent file path', () => {
    const filePath = `${tmpWorkDir}/some-file.txt`;
    const fileContent = 'This is the file contents!';

    writeFile(filePath, fileContent);

    expect(existsSync(filePath)).to.be.true;
    expect(readFileSync(filePath, 'utf8')).to.equal(fileContent);
  });
});
