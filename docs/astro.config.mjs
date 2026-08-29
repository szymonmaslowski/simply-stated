import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

import { basePath, repositoryUrl, sidebar } from './scripts/docs-sources.mjs';

export default defineConfig({
  site: process.env['DOCS_SITE'] ?? 'https://szymonmaslowski.github.io',
  base: basePath || undefined,
  integrations: [
    starlight({
      title: 'Simply Stated',
      description:
        'Strongly typed, declarative utility for state machine modelling that integrates with your existing state management solution.',
      social: [
        { icon: 'github', label: 'GitHub', href: repositoryUrl },
        {
          icon: 'npm',
          label: 'npm',
          href: 'https://www.npmjs.com/package/simply-stated',
        },
      ],
      sidebar,
      lastUpdated: true,
    }),
  ],
});
