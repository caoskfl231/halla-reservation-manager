import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Only quoted, existing local CSS/JS URLs are changed. External URLs, other
// parameters, fragments and quote styles are preserved.
export function rewriteAssetReferences(source, sourceFile, root, version, fileExists = existsSync) {
  return source.replace(/(["'`])((?:\.{1,2}\/)?[A-Za-z0-9_./-]+\.(?:css|js)(?:\?[^"'`\s<>#]*)?(?:#[^"'`\s<>]*)?)\1/g,
    (original, quote, url) => {
      const hashIndex = url.indexOf('#');
      const fragment = hashIndex < 0 ? '' : url.slice(hashIndex);
      const withoutHash = hashIndex < 0 ? url : url.slice(0, hashIndex);
      const [path, query = ''] = withoutHash.split('?');
      const target = resolve(dirname(sourceFile), path);
      const local = relative(root, target);
      if (local === '..' || local.startsWith('..' + sep) || !fileExists(target)) return original;
      const params = query.split('&').filter(value => value && !/^v(?:=|$)/.test(value));
      params.push('v=' + version);
      return quote + path + '?' + params.join('&') + fragment + quote;
    });
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || ['tools', 'tests', 'vendor'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.html', '.js', '.css'].includes(extname(path)) ? [path] : [];
  });
}

export function updateAssetVersions(root = projectRoot, check = false) {
  const { version } = JSON.parse(readFileSync(join(root, 'asset-version.json'), 'utf8'));
  if (typeof version !== 'string' || !/^[A-Za-z0-9_-]+$/.test(version)) {
    throw new Error('asset-version.json: version must contain only letters, numbers, _ or -');
  }
  const changed = [];
  for (const path of sourceFiles(root)) {
    const source = readFileSync(path, 'utf8');
    const updated = rewriteAssetReferences(source, path, root, version);
    if (updated === source) continue;
    changed.push(relative(root, path));
    if (!check) writeFileSync(path, updated);
  }
  return { version, changed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check')) throw new Error('Usage: node tools/update-asset-version.mjs [--check]');
  const check = args.includes('--check');
  const result = updateAssetVersions(projectRoot, check);
  if (check && result.changed.length) {
    console.error('Asset version mismatch: ' + result.changed.join(', '));
    process.exitCode = 1;
  } else {
    console.log(result.version + ': ' + (check ? 'all references synchronized' : result.changed.length + ' files updated'));
  }
}
