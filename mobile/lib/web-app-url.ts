/** Ensures API calls work whether the configured URL includes a trailing slash or not. */
export function apiUrl(baseUrl: string | undefined, path: string): string | null {
  const base = baseUrl?.trim().replace(/\/+$/, "");
  if (!base || !/^https?:\/\//i.test(base)) return null;
  return `${base}/${path.replace(/^\/+/, "")}`;
}
