/** To prevent the abusive case where someone sets up a malicious feed of 100G. */
const defaultMaxResponseBytes = 10 * 1024 * 124;

export async function fetch(url: URL, maxResponseBytes = defaultMaxResponseBytes): Promise<Response> {
  return globalThis.fetch(url, { redirect: 'follow' }).then((response) => {
    const limitedStream = getLimitedReadableStream(response.body, maxResponseBytes);

    return new Response(limitedStream, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  });
}

export type FetchFn = typeof fetch;

export function getLimitedReadableStream(
  inputStream: ReadableStream<Uint8Array> | null,
  maxBytes: number
): ReadableStream<Uint8Array> | null {
  if (!inputStream) {
    return null;
  }

  const reader = inputStream.getReader();
  let bytesRead = 0;

  return new ReadableStream({
    start(controller) {
      function push() {
        reader.read().then(({ done, value }) => {
          if (done || bytesRead >= maxBytes) {
            controller.close();
            return;
          }

          const bytesLeftToRead = maxBytes - bytesRead;
          const chunk = value.slice(0, bytesLeftToRead);

          controller.enqueue(chunk);
          bytesRead += chunk.length;

          push();
        });
      }

      push();
    },
  });
}
