export const STORE_BASE_PATH = '/store';

/** True for the store root and every page below it. */
export function isStorePath(pathname: string): boolean {
  return pathname === STORE_BASE_PATH || pathname.startsWith(`${STORE_BASE_PATH}/`);
}

/**
 * Turns an old root-relative store path into its public address below /store.
 * Already-prefixed paths, external URLs and anchors are left unchanged.
 */
export function withStoreBase(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  if (path === STORE_BASE_PATH || path.startsWith(`${STORE_BASE_PATH}/`)) return path;
  return path === '/' ? STORE_BASE_PATH : `${STORE_BASE_PATH}${path}`;
}
