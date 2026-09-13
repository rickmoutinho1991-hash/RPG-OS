import { createClient, SupabaseClient } from "@supabase/supabase-js";

let adminClientInstance: SupabaseClient | null = null;

const DEFAULT_FETCH_TIMEOUT_MS = 6000;

function createFetchWithTimeout(timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Se já havia um signal no init, encadeamos
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

export function createAdminClient(): SupabaseClient {
  if (!adminClientInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
      );
    }

    adminClientInstance = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          fetch: createFetchWithTimeout(6000),
        },
      },
    );
  }
  return adminClientInstance;
}


