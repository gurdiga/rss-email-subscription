// Copied from here:
// https://github.com/systemjs/systemjs-examples/blob/8d98f45/loading-code/typescript-default-extension/src/systemjs-hooks/resolve.ts

const endsWithFileExtension = /\/?\.[a-zA-Z]{2,}$/;
const originalResolve = System.constructor.prototype.resolve;

System.constructor.prototype.resolve = function () {
  // apply original resolve to make sure importmaps are resolved first
  const url = originalResolve.apply(this, arguments);

  // append .js file extension if url is missing a file extension
  return endsWithFileExtension.test(url) ? url : url + '.js';
};
