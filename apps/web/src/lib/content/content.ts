import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import { cache } from 'react';

import type { ContentEntry, ToolFrontmatter, WorkFrontmatter } from './types';

const CONTENT_ROOT_CANDIDATES = [
  path.join(process.cwd(), 'content'),
  path.join(process.cwd(), 'apps/web/content'),
];
const DEFAULT_CONTENT_ROOT = path.join(process.cwd(), 'content');

const CONTENT_ROOT =
  CONTENT_ROOT_CANDIDATES.find((candidate) => existsSync(candidate)) ?? DEFAULT_CONTENT_ROOT;

function resolveSectionDirectory(section: 'work' | 'tools'): string {
  const sectionCandidate = CONTENT_ROOT_CANDIDATES.map((root) => path.join(root, section)).find((candidate) =>
    existsSync(candidate),
  );

  return sectionCandidate ?? path.join(CONTENT_ROOT, section);
}

function isMdxFile(fileName: string): boolean {
  return fileName.endsWith('.mdx') || fileName.endsWith('.md');
}

function getSlug(fileName: string): string {
  return fileName.replace(/\.mdx?$/, '');
}

function compareByDateDesc(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

async function readEntry<TFrontmatter>(
  section: 'work' | 'tools',
  slug: string,
): Promise<ContentEntry<TFrontmatter> | null> {
  if (!/^[a-z0-9-]+$/i.test(slug)) {
    return null;
  }

  const sectionDirectory = resolveSectionDirectory(section);
  const mdxPath = path.join(sectionDirectory, `${slug}.mdx`);
  const mdPath = path.join(sectionDirectory, `${slug}.md`);

  const filePath = existsSync(mdxPath) ? mdxPath : mdPath;
  if (!existsSync(filePath)) {
    return null;
  }

  const source = await readFile(filePath, 'utf8');
  const { data, content } = matter(source);

  return {
    slug,
    frontmatter: data as TFrontmatter,
    body: content,
  };
}

async function readEntries<TFrontmatter>(section: 'work' | 'tools'): Promise<Array<ContentEntry<TFrontmatter>>> {
  const sectionDirectory = resolveSectionDirectory(section);
  const files = await readdir(sectionDirectory);

  const entries = await Promise.all(
    files.filter(isMdxFile).map(async (fileName) => {
      const source = await readFile(path.join(sectionDirectory, fileName), 'utf8');
      const { data, content } = matter(source);

      return {
        slug: getSlug(fileName),
        frontmatter: data as TFrontmatter,
        body: content,
      };
    }),
  );

  return entries;
}

export const getAllWork = cache(async () => {
  const entries = await readEntries<WorkFrontmatter>('work');

  return entries.sort((a, b) => compareByDateDesc(a.frontmatter.date, b.frontmatter.date));
});

export const getWorkBySlug = cache(async (slug: string) => readEntry<WorkFrontmatter>('work', slug));

export const getAllWorkSlugs = cache(async () => {
  const entries = await getAllWork();
  return entries.map((entry) => entry.slug);
});

export const getAllTools = cache(async () => {
  const entries = await readEntries<ToolFrontmatter>('tools');

  return entries.sort((a, b) => a.frontmatter.title.localeCompare(b.frontmatter.title));
});

export const getToolBySlug = cache(async (slug: string) => readEntry<ToolFrontmatter>('tools', slug));

export const getAllToolSlugs = cache(async () => {
  const entries = await getAllTools();
  return entries.map((entry) => entry.slug);
});
