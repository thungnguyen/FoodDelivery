export const normalizeBaseUrl = (rawValue, fallback, trims = []) => {
  let base = (rawValue || fallback || '').toString().trim();
  if (!base) return '';
  base = base.replace(/\/+$/, '');
  trims.forEach((suffix) => {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      base = base.replace(/\/+$/, '');
    }
  });
  if (base.endsWith('/api')) {
    base = base.slice(0, -4);
  }
  return base;
};

export default { normalizeBaseUrl };
