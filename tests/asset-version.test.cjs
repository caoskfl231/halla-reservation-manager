const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('asset URLs preserve parameters and ignore external or missing files', async () => {
  const { rewriteAssetReferences } = await import('../tools/update-asset-version.mjs');
  const root = path.resolve('fixture');
  const input = '<link href="css/style.css"><script src="js/main.js?v=old&mode=1#section"></script>\n' +
    'import("./js/worker.js?v=old"); "https://example.com/js/main.js?v=old"; "missing.js?v=old";';
  const exists = p => ['css/style.css', 'js/main.js', 'js/worker.js'].includes(path.relative(root, p).split(path.sep).join('/'));
  const output = rewriteAssetReferences(input, path.join(root, 'index.html'), root, 'release-2', exists);
  assert.match(output, /css\/style.css\?v=release-2/);
  assert.match(output, /js\/main.js\?mode=1&v=release-2#section/);
  assert.match(output, /js\/worker.js\?v=release-2/);
  assert.ok(output.includes('"https://example.com/js/main.js?v=old"'));
  assert.ok(output.includes('"missing.js?v=old"'));
  assert.equal(rewriteAssetReferences(output, path.join(root, 'index.html'), root, 'release-2', exists), output);
});

test('nested module imports update; paths outside project do not', async () => {
  const { rewriteAssetReferences } = await import('../tools/update-asset-version.mjs');
  const root = path.resolve('fixture');
  const output = rewriteAssetReferences("'../db.js?v=old'; '../../outside.js?v=old';", path.join(root, 'js/common/module.js'), root, 'release-2', () => true);
  assert.equal(output, "'../db.js?v=release-2'; '../../outside.js?v=release-2';");
  const outside = rewriteAssetReferences("'../../../outside.js?v=old'", path.join(root, 'js/common/module.js'), root, 'release-2', () => true);
  assert.equal(outside, "'../../../outside.js?v=old'");
});

test('check detects omissions without writing; update is idempotent', async () => {
  const { updateAssetVersions } = await import('../tools/update-asset-version.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'halla-assets-'));
  try {
    fs.mkdirSync(path.join(root, 'js'));
    fs.writeFileSync(path.join(root, 'asset-version.json'), '{"version":"release-3"}');
    fs.writeFileSync(path.join(root, 'js/main.js'), '');
    fs.writeFileSync(path.join(root, 'index.html'), '<script src="js/main.js?v=old"></script>');
    assert.deepEqual(updateAssetVersions(root, true).changed, ['index.html']);
    assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /v=old/);
    assert.deepEqual(updateAssetVersions(root).changed, ['index.html']);
    assert.deepEqual(updateAssetVersions(root, true).changed, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
