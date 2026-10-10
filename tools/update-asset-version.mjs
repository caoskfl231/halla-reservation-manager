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

// 공통 메뉴는 브라우저에서 페이지 루트 기준으로 이동한다.
export function rewriteNavigationReferences(source, root, version) {
  return source.replace(/href=(["'])([A-Za-z0-9_./-]+\.html)(?:\?[^"']*)?\1/g,
    (original, quote, path) => existsSync(resolve(root, path))
      ? 'href=' + quote + path + '?v=' + version + quote : original);
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
  // 메뉴를 HTML에 포함해 DB 인증이나 별도 fetch를 기다리지 않고 화면 틀을 그린다.
  const navPath = join(root, 'common/nav.html');
  const nav = existsSync(navPath) ? rewriteNavigationReferences(readFileSync(navPath, 'utf8'), root, version).trim() : '';
  for (const path of sourceFiles(root)) {
    const source = readFileSync(path, 'utf8');
    let updated = rewriteAssetReferences(source, path, root, version);
    if (relative(root, path).replaceAll(sep, '/') === 'common/nav.html') {
      updated = rewriteNavigationReferences(updated, root, version);
    }
    if (nav && dirname(path) === root && extname(path) === '.html') {
      const title = updated.match(/data-title="([^"]*)"/)?.[1];
      const pageNav = title ? nav.replace('>할라장부관리</h1>', '>' + title + '</h1>') : nav;
      updated = updated.replace(/<div id="global-nav-include">(?:\s*<!-- navigation:start -->[\s\S]*?<!-- navigation:end -->\s*)?<\/div>/,
        '<div id="global-nav-include"><!-- navigation:start -->\n' + pageNav + '\n<!-- navigation:end --></div>');
    }
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
