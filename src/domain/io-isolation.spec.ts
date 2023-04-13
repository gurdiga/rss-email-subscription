import { expect } from 'chai';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { rmdirRecursively, listFiles, mkdirp, writeFile } from './io-isolation';
import { makePath } from '../shared/path-utils';

describe(mkdirp.name, () => {
  const tmpWorkDir = mkdtempSync(makePath(os.tmpdir(), 'res-test-mkdirp-'));

  it('creates nested directories', () => {
    const dir = makePath(tmpWorkDir, 'one/two/three');

    mkdirp(dir);

    expect(existsSync(dir)).to.be.true;
  });
});

describe(rmdirRecursively.name, () => {
  const tmpWorkDir = mkdtempSync(makePath(os.tmpdir(), 'res-test-rmdir-'));

  it('removes directories recursively', () => {
    const dir = makePath(tmpWorkDir, 'one/two/three');
    const subDir = makePath(dir, 'subdir');
    const filePath = makePath(dir, 'a-file.json');

    mkdirp(dir);
    mkdirp(subDir);
    writeFile(filePath, 'some content');
    rmdirRecursively(dir);

    expect(existsSync(dir)).to.be.false;
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
