const CONTEXT_API_ROOT = "https://api.context.dev/v1";
const CONTEXT_CONCURRENCY = 3;

const globalContextQueue = globalThis as typeof globalThis & {
  criblistContextActiveRequests?: number;
  criblistContextWaiters?: Array<() => void>;
};
globalContextQueue.criblistContextActiveRequests ??= 0;
globalContextQueue.criblistContextWaiters ??= [];

class ContextRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export async function requestContext(
  path: string,
  apiKey: string,
  options: {
    init?: RequestInit;
    timeoutMs: number;
    maxAttempts?: number;
  },
) {
  const maxAttempts = options.maxAttempts ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await withContextSlot(() =>
        fetch(`${CONTEXT_API_ROOT}${path}`, {
          ...options.init,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...options.init?.headers,
          },
          signal: AbortSignal.timeout(options.timeoutMs),
        }),
      );
      const result = await response.json();
      if (!response.ok) {
        const body = result as { message?: string; error_code?: string };
        const retryAfter = Number(response.headers.get("retry-after"));
        throw new ContextRequestError(
          body.message ??
            body.error_code ??
            `Context.dev returned ${response.status}.`,
          response.status,
          Number.isFinite(retryAfter) ? retryAfter : undefined,
        );
      }
      return result;
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof ContextRequestError
          ? error.status === 408 || error.status === 429 || error.status >= 500
          : true;
      if (!retryable || attempt === maxAttempts - 1) break;
      const delaySeconds =
        error instanceof ContextRequestError
          ? error.retryAfter ?? 2 ** attempt
          : 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Context.dev request failed.");
}

async function withContextSlot<T>(request: () => Promise<T>) {
  await acquireContextSlot();
  try {
    return await request();
  } finally {
    releaseContextSlot();
  }
}

async function acquireContextSlot() {
  if (
    (globalContextQueue.criblistContextActiveRequests ?? 0) <
    CONTEXT_CONCURRENCY
  ) {
    globalContextQueue.criblistContextActiveRequests =
      (globalContextQueue.criblistContextActiveRequests ?? 0) + 1;
    return;
  }
  await new Promise<void>((resolve) => {
    globalContextQueue.criblistContextWaiters?.push(resolve);
  });
  globalContextQueue.criblistContextActiveRequests =
    (globalContextQueue.criblistContextActiveRequests ?? 0) + 1;
}

function releaseContextSlot() {
  globalContextQueue.criblistContextActiveRequests = Math.max(
    0,
    (globalContextQueue.criblistContextActiveRequests ?? 1) - 1,
  );
  globalContextQueue.criblistContextWaiters?.shift()?.();
}

export function markdownPath(
  url: string,
  options: {
    maxAgeMs: number;
    waitForMs: number;
    timeoutMs: number;
    includeImages?: boolean;
  },
) {
  const params = new URLSearchParams({
    url,
    includeLinks: "true",
    includeImages: String(options.includeImages ?? true),
    useMainContentOnly: "true",
    shortenBase64Images: "true",
    maxAgeMs: String(options.maxAgeMs),
    waitForMs: String(options.waitForMs),
    timeoutMS: String(options.timeoutMs),
    country: "us",
  });
  return `/web/scrape/markdown?${params.toString()}`;
}

export function htmlPath(
  url: string,
  options: {
    maxAgeMs: number;
    waitForMs: number;
    timeoutMs: number;
  },
) {
  const params = new URLSearchParams({
    url,
    maxAgeMs: String(options.maxAgeMs),
    waitForMs: String(options.waitForMs),
    timeoutMS: String(options.timeoutMs),
    country: "us",
  });
  return `/web/scrape/html?${params.toString()}`;
}
