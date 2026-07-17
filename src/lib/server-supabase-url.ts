function isCodespacesForwardedHost(hostname: string) {
  return hostname.endsWith(".app.github.dev");
}

export function resolveServerSupabaseUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);

    if (isCodespacesForwardedHost(parsed.hostname)) {
      return "http://127.0.0.1:54321";
    }
  } catch {
    return rawUrl;
  }

  return rawUrl;
}