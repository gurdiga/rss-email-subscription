function main() {
  const queryParams = parseQueryParams(location.search);

  console.log({ queryParams });

  // TODO
}

function parseQueryParams(locationSearch: string) {
  return locationSearch;
}

main();
