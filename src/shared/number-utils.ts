// Kudos to https://github.com/andrewrk/node-human-size/blob/3fb7fca/index.js
var mags = ' KMGTPEZY';

export function humanSize(bytes: number, precision: number = 0) {
  var magnitude = Math.min((Math.log(bytes) / Math.log(1024)) | 0, mags.length - 1);
  var result = bytes / Math.pow(1024, magnitude);
  var suffix = mags[magnitude]!.trim() + 'B';

  return result.toFixed(precision) + suffix;
}
