import { createServerClient } from "@supabase/ssr";

const DEFAULT_FETCH_TIMEOUT_MS = 6000;

function createFetchWithTimeout(timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    if (init?.signal) {
      init.signal.addEventListener("abort", () => controller.abort());
    }

    return fetch(input, {
      ...init,
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timer);
    });
  };
}

export async function createClient() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_test_key",
    {
      global: {
        fetch: createFetchWithTimeout(5000),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components não podem modificar cookies.
            // O refresh da sessão é tratado pelo middleware/proxy.
          }
        },
      },
    },
  );
}

