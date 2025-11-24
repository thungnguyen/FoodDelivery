const stripTrailingSlash = (value = '') => value.replace(/\/+$/, '');

export const normalizeBaseUrl = (rawValue, fallback, suffixes = []) => {
  let base = stripTrailingSlash(rawValue || fallback || '');

  suffixes.forEach((suffix) => {
    const normalizedSuffix = stripTrailingSlash(suffix || '');
    if (!normalizedSuffix) return;
    if (base.endsWith(normalizedSuffix)) {
      base = base.slice(0, base.length - normalizedSuffix.length);
    }
    base = stripTrailingSlash(base);
  });

  return stripTrailingSlash(base) || stripTrailingSlash(fallback || '');
};

export default normalizeBaseUrl;
