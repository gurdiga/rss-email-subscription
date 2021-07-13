import { expect } from 'chai';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { listFiles, mkdirp, moveFile, writeFile } from './io';

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
      writeFileSync(`${tmpWorkDir}/${fileName}`, 'content');
    });

    mkdirSync(`${tmpWorkDir}/subdir`);

    expect(listFiles(tmpWorkDir)).to.deep.equal(fileNames);
  });
});

describe(moveFile.name, () => {
  const tmpWorkDir = mkdtempSync(path.join(os.tmpdir(), 'res-test-moveFile-'));

  it('moves a file from path A to path B', () => {
    mkdirSync(`${tmpWorkDir}/dir1`);
    mkdirSync(`${tmpWorkDir}/dir2`);
    writeFileSync(`${tmpWorkDir}/dir1/file.txt`, 'some file content');

    moveFile(`${tmpWorkDir}/dir1/file.txt`, `${tmpWorkDir}/dir2/file.txt`);
    expect(existsSync(`${tmpWorkDir}/dir2/file.txt`)).to.be.true;
    expect(existsSync(`${tmpWorkDir}/dir1/file.txt`)).to.be.false;
  });
});
