export function compactParams(query: Record<string, unknown>): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'string' || typeof value === 'number') {
      result[key] = value;
    }
  });
  return result;
}
