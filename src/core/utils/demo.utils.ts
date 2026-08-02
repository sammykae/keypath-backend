// Codex: centralize DEMO_MODE parsing here so callers are not coupled to env parser quirks.
const TRUE_LIKE_FLAGS = new Set(['1', 'true', 'yes', 'on']);

export function isDemoModeEnabled(): boolean {
  const rawValue = process.env.DEMO_MODE;
  if (!rawValue) return false;

  return TRUE_LIKE_FLAGS.has(rawValue.trim().toLowerCase());
}

export function demoOrReal<T>(
  demoData: T,
  realResolver: () => Promise<T>
): Promise<T> { 
  // Codex: always use the same flag parser for consistent demo behavior.
  if (isDemoModeEnabled()) {
    return Promise.resolve(demoData);
  }
  return realResolver();
}
