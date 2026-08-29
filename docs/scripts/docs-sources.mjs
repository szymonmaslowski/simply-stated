import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const docsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const repositoryRoot = path.resolve(docsRoot, '..');
export const contentRoot = path.join(docsRoot, 'src', 'content', 'docs');

export const repositoryUrl = 'https://github.com/szymonmaslowski/simply-stated';

// Anything the site cannot render itself (source files, LICENSE) is linked
// against this ref on GitHub instead.
export const sourceRef = process.env['DOCS_SOURCE_REF'] ?? 'main';

// Set when the site is not served from the domain root (GitHub project pages).
export const basePath = (process.env['DOCS_BASE'] ?? '').replace(/\/$/, '');

export const markdownPages = [
  { source: 'README.md', route: 'index', order: 0 },
  { source: 'API_REFERENCE.md', route: 'api-reference', order: 1 },
  {
    source: 'simply-stated/src/nesting/README.md',
    route: 'guides/nesting',
    order: 0,
  },
  {
    source: 'simply-stated/src/adapters/README.md',
    route: 'adapters',
    order: 0,
  },
  {
    source: 'simply-stated/src/adapters/redux-toolkit/README.md',
    route: 'adapters/redux-toolkit',
    order: 1,
  },
  {
    source: 'simply-stated/src/adapters/zustand/README.md',
    route: 'adapters/zustand',
    order: 2,
  },
  { source: 'examples/README.md', route: 'examples', order: 0 },
  {
    source: 'examples/redux-toolkit/README.md',
    route: 'examples/redux-toolkit',
    order: 0,
  },
  { source: 'examples/zustand/README.md', route: 'examples/zustand', order: 0 },
  {
    source: 'examples/nesting/README.md',
    route: 'examples/nesting',
    order: 0,
  },
];

// Every `.ts` file below this directory gets a syntax-highlighted page, so the
// prose can link to the code it talks about without leaving the site.
export const exampleSourceRoot = 'examples';

// Starlight prepends `base` to sidebar links itself, so those get the bare
// path. Links inside the mirrored markdown are emitted verbatim and need the
// prefix baked in.
export const routePath = route => `/${route === 'index' ? '' : `${route}/`}`;

export const routeToUrl = route => `${basePath}${routePath(route)}`;

export const toGithubUrl = repositoryRelativePath =>
  `${repositoryUrl}/blob/${sourceRef}/${repositoryRelativePath}`;

export const sidebar = [
  {
    label: 'Start here',
    items: [
      { label: 'Overview', link: routePath('index') },
      { label: 'API reference', link: routePath('api-reference') },
    ],
  },
  {
    label: 'Guides',
    items: [{ label: 'Nesting machines', link: routePath('guides/nesting') }],
  },
  {
    label: 'Adapters',
    items: [
      { label: 'Overview', link: routePath('adapters') },
      { label: 'Redux Toolkit', link: routePath('adapters/redux-toolkit') },
      { label: 'Zustand', link: routePath('adapters/zustand') },
    ],
  },
  {
    label: 'Examples',
    items: [
      { label: 'Overview', link: routePath('examples') },
      { autogenerate: { directory: 'examples' } },
    ],
  },
];
