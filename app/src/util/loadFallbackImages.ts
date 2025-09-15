export const loadFallbackImageUrls = async () => {
  // Try to fetch a JSON index; fallback to hardcoded if not found
  try {
    const res = await fetch("/public/fallbackImages/index.json");
    const files: string[] = await res.json();
    return files.map(f => `/public/fallbackImages/${f}`);
  } catch {
    // fallback if no index.json exists
    return [];
  }
};