import { expect } from 'chai';
import { exists, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { listFiles, mkdirp, writeFile } from './io';

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

describe(listFiles.name, () => {
  const tmpWorkDir = mkdtempSync(path.join(os.tmpdir(), 'res-test-listFiles-'));

  it('returns the names of files in the given directory, ignoring subdirectories', () => {
    const fileNames = ['file1.txt', 'file2.txt', 'file3.txt'];

    fileNames.forEach((fileName) => {
      writeFileSync(`${tmpWorkDir}/${fileName}`, 'content', { encoding: 'utf8' });
    });

    mkdirSync(`${tmpWorkDir}/subdir`);

    expect(listFiles(tmpWorkDir)).to.deep.equal(fileNames);
  });

  // TODO: returns an Err when directory not found
});
