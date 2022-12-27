import { expect } from 'chai';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { listFiles, mkdirp, writeFile } from './io-isolation';
import { makePath } from './path-utils';

describe(mkdirp.name, () => {
  const tmpWorkDir = mkdtempSync(makePath(os.tmpdir(), 'res-test-mkdirp-'));

  it('creates nested directories', () => {
    const dir = makePath(tmpWorkDir, 'one/two/three');

    mkdirp(dir);

    expect(existsSync(dir)).to.be.true;
  });
});

describe(writeFile.name, () => {
  const tmpWorkDir = mkdtempSync(makePath(os.tmpdir(), 'res-test-writeFile-'));

  it('writes the given content to the givent file path', () => {
    const filePath = makePath(tmpWorkDir, 'some-file.txt');
    const fileContent = 'This is the file contents!';

    writeFile(filePath, fileContent);

    expect(existsSync(filePath)).to.be.true;
    expect(readFileSync(filePath, 'utf8')).to.equal(fileContent);
  });
});

describe(listFiles.name, () => {
  const tmpWorkDir = mkdtempSync(makePath(os.tmpdir(), 'res-test-listFiles-'));

  it('returns the names of files in the given directory, ignoring subdirectories', () => {
    const fileNames = ['file1.txt', 'file2.txt', 'file3.txt'];

    fileNames.forEach((fileName) => {
      writeFileSync(makePath(tmpWorkDir, fileName), 'content');
    });

    mkdirSync(makePath(tmpWorkDir, 'subdir'));

    expect(listFiles(tmpWorkDir)).to.deep.equal(fileNames);
  });
});
