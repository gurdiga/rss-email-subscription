function main() {
  const queryParams = parseQueryParams(location.search);

  console.log({ queryParams });
}

function parseQueryParams(locationSearch: string) {
  return locationSearch;
}

main();
