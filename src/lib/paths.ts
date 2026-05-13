// Asset path helper — handles basePath automatically
// Use this for ALL client-side fetch() calls to public assets
// 
// ⚠️  NEVER use absolute paths like '/data/xxx.json' directly in fetch()!
//     When basePath is set, absolute paths break.
//     Always use getAssetPath() or import from this module.

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * Returns an absolute path with basePath prefix for public assets.
 * 
 * @param path — absolute path starting with / (e.g., '/data/conditions.json')
 * @returns path with basePath prefix (e.g., '/data/conditions.json')
 * 
 * Usage:
 *   fetch(getAssetPath('/data/conditions.json'))
 *   fetch(getAssetPath('/data/dawn-patrol.json'))
 */
export function getAssetPath(path: string): string {
  // Ensure path starts with /
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}

/**
 * Returns a relative path for use in <a href> or <img src>.
 * Next.js handles basePath automatically for <Link> and <Image>,
 * but for raw HTML attributes or fetch(), use getAssetPath().
 */
export function getRelativePath(path: string): string {
  return path.startsWith('/') ? `.${path}` : path;
}
