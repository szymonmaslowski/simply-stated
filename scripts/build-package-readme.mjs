// Copies the repository root README into the package, rewriting every relative
// link into an absolute GitHub URL pinned to the release tag. npm does not
// reliably resolve relative links against the `repository` field, and the
// linked files are not part of the published tarball.
//
// Pinning to the tag (not to main) keeps the links of an already published
// version pointing at the docs that shipped with it.

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const sourceReadmePath = path.join(repositoryRoot, 'README.md');
const packageDirectory = path.join(repositoryRoot, 'simply-stated');
const targetReadmePath = path.join(packageDirectory, 'README.md');

const { version, repository } = JSON.parse(
  readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'),
);

const repositoryUrl = repository.url
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');
const tag = `v${version}`;

const banner = `<!-- Generated from the repository root README.md by scripts/build-package-readme.mjs. Do not edit. -->`;

const isUrlExternal = url =>
  /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');

const toAbsoluteUrl = url => {
  const [target, ...anchorParts] = url.split('#');
  const anchor = anchorParts.length ? `#${anchorParts.join('#')}` : '';
  if (!target) return url;

  const resolvedPath = path.resolve(repositoryRoot, target);
  const pathFromRoot = path.relative(repositoryRoot, resolvedPath);
  if (pathFromRoot.startsWith('..')) {
    throw new Error(`README links outside of the repository: '${url}'`);
  }
  if (!existsSync(resolvedPath)) {
    throw new Error(`README links to a non-existent path: '${url}'`);
  }

  const kind = statSync(resolvedPath).isDirectory() ? 'tree' : 'blob';
  const posixPathFromRoot = pathFromRoot.split(path.sep).join('/');
  return `${repositoryUrl}/${kind}/${tag}/${posixPathFromRoot}${anchor}`;
};

// Raw HTML is passed through untouched, so a relative href hidden in it would
// silently ship broken. Fail instead of guessing.
const assertNoRelativeHtmlLinks = html => {
  const relativeHtmlLink = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  for (const [, url] of html.matchAll(relativeHtmlLink)) {
    if (isUrlExternal(url) || url.startsWith('#')) continue;
    throw new Error(
      `README contains a relative link in raw HTML ('${url}'), which cannot be rewritten. Use markdown syntax instead.`,
    );
  }
};

const absolutiseLinks = () => tree => {
  visit(tree, ['link', 'image', 'definition'], node => {
    if (isUrlExternal(node.url) || node.url.startsWith('#')) return;
    node.url = toAbsoluteUrl(node.url);
  });
  visit(tree, ['html'], node => assertNoRelativeHtmlLinks(node.value));
};

const sourceReadmeContent = readFileSync(sourceReadmePath, 'utf8');
const finalReadmeContent = await remark()
  .use(remarkGfm)
  .use(absolutiseLinks)
  .data('settings', { bullet: '-', emphasis: '_', rule: '-' })
  .process(sourceReadmeContent);

writeFileSync(targetReadmePath, `${banner}\n\n${finalReadmeContent}`);

console.info(
  `Wrote ${path.relative(repositoryRoot, targetReadmePath)} with links pinned to ${tag}`,
);
