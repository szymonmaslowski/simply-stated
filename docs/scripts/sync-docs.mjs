// Mirrors the repository's markdown (root README, API reference, package and
// example READMEs) into the Starlight content collection, adding the
// frontmatter Starlight requires and rewriting every relative link to the page
// it became. Links to files the site does not render (sources, LICENSE) are
// pointed at GitHub. Generated output is disposable — never edit it by hand.

import { readdir, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { toString as mdastToString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';

import {
  contentRoot,
  exampleSourceRoot,
  markdownPages,
  repositoryRoot,
  routeToUrl,
  toGithubUrl,
} from './docs-sources.mjs';

const findTypescriptSources = async directory => {
  const entries = await readdir(path.join(repositoryRoot, directory), {
    withFileTypes: true,
  });

  const sources = await Promise.all(
    entries.map(entry => {
      const entryPath = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) return findTypescriptSources(entryPath);
      return entry.name.endsWith('.ts') ? [entryPath] : [];
    }),
  );

  return sources.flat().sort();
};

const buildRouteMap = exampleSources => {
  const routes = new Map(
    markdownPages.map(({ source, route }) => [source, route]),
  );

  for (const source of exampleSources) {
    routes.set(source, source.replace(/\.ts$/, ''));
  }

  return routes;
};

const isExternalUrl = url =>
  /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');

const createLinkRewriter = routes => (url, sourcePath) => {
  if (!url || isExternalUrl(url) || url.startsWith('#')) return url;

  const [target, ...anchorParts] = url.split('#');
  const anchor = anchorParts.length ? `#${anchorParts.join('#')}` : '';
  if (!target) return url;

  const repositoryRelativePath = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourcePath), target),
  );
  if (repositoryRelativePath.startsWith('..')) return url;

  const route =
    routes.get(repositoryRelativePath) ??
    routes.get(path.posix.join(repositoryRelativePath, 'README.md'));

  return route
    ? `${routeToUrl(route)}${anchor}`
    : `${toGithubUrl(repositoryRelativePath)}${anchor}`;
};

const toFrontmatter = ({ title, description, order, label }) => {
  const lines = ['---', `title: ${JSON.stringify(title)}`];
  if (description) lines.push(`description: ${JSON.stringify(description)}`);
  lines.push('sidebar:', `  order: ${order}`);
  if (label) lines.push(`  label: ${JSON.stringify(label)}`);
  lines.push('---', '');
  return lines.join('\n');
};

const summarise = text => {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 160) return collapsed;

  const clipped = collapsed.slice(0, 160);
  return `${clipped.slice(0, clipped.lastIndexOf(' ')).trimEnd()}…`;
};

// Starlight renders the frontmatter title as the page heading, so the source's
// own H1 is lifted out instead of being rendered twice.
const extractTitleAndDescription = tree => {
  const headingIndex = tree.children.findIndex(
    node => node.type === 'heading' && node.depth === 1,
  );
  if (headingIndex === -1) return {};

  const [heading] = tree.children.splice(headingIndex, 1);
  const firstParagraph = tree.children
    .slice(headingIndex)
    .find(node => node.type === 'paragraph');

  return {
    title: mdastToString(heading),
    description: firstParagraph ? summarise(mdastToString(firstParagraph)) : '',
  };
};

const writePage = async (route, contents) => {
  const targetPath = path.join(contentRoot, `${route}.md`);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, contents, 'utf8');
};

const renderMarkdownPage = async ({ source, route, order }, rewriteLink) => {
  const raw = await readFile(path.join(repositoryRoot, source), 'utf8');

  let title = source;
  let description = '';

  const rendered = await remark()
    .use(remarkGfm)
    .use(() => tree => {
      ({ title = source, description = '' } = extractTitleAndDescription(tree));

      visit(tree, ['link', 'definition'], node => {
        node.url = rewriteLink(node.url, source);
      });
    })
    .process(raw);

  await writePage(
    route,
    toFrontmatter({ title, description, order }) + String(rendered),
  );
};

const renderSourcePage = async (source, route, order) => {
  const code = await readFile(path.join(repositoryRoot, source), 'utf8');
  const longestFence = Math.max(
    2,
    ...[...code.matchAll(/`+/g)].map(([run]) => run.length),
  );
  const fence = '`'.repeat(longestFence + 1);
  const fileName = path.posix.basename(source);

  await writePage(
    route,
    [
      toFrontmatter({
        title: source,
        description: `Source of ${source}.`,
        order,
        label: fileName,
      }),
      `[View on GitHub](${toGithubUrl(source)})`,
      '',
      `${fence}ts`,
      code.trimEnd(),
      fence,
      '',
    ].join('\n'),
  );
};

const sync = async () => {
  const exampleSources = await findTypescriptSources(exampleSourceRoot);
  const rewriteLink = createLinkRewriter(buildRouteMap(exampleSources));

  await rm(contentRoot, { recursive: true, force: true });
  await mkdir(contentRoot, { recursive: true });

  await Promise.all([
    ...markdownPages.map(page => renderMarkdownPage(page, rewriteLink)),
    ...exampleSources.map((source, index) =>
      renderSourcePage(source, source.replace(/\.ts$/, ''), index + 1),
    ),
  ]);

  console.log(
    `Synced ${markdownPages.length} documents and ${exampleSources.length} sources into ${path.relative(process.cwd(), contentRoot)}`,
  );
};

await sync();

if (process.argv.includes('--watch')) {
  const { watch } = await import('chokidar');

  const watched = [
    ...markdownPages.map(({ source }) => path.join(repositoryRoot, source)),
    path.join(repositoryRoot, exampleSourceRoot),
  ];

  watch(watched, { ignoreInitial: true }).on('all', () => {
    sync().catch(error => console.error(error));
  });

  console.log('Watching documentation sources for changes.');
}
