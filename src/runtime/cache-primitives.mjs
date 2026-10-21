export function setTimedCache(map, key, value, ttlMs) {
  map.delete(key);
  map.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

export function enforceMapCapacity(map, maxSize) {
  const limit = Math.max(1, Number(maxSize) || 1);
  while (map.size > limit) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) break;
    map.delete(oldestKey);
  }
}

export function getTimedCache(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    map.delete(key);
    return null;
  }
  // Touch hit so iteration order keeps least-recently-used entries first.
  map.delete(key);
  map.set(key, entry);
  return entry.value;
}
