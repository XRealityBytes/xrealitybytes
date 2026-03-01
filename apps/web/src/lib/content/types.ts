export interface WorkFrontmatter {
  title: string;
  date: string;
  summary: string;
  tags: string[];
  heroImage: string;
}

export interface ToolLink {
  label: string;
  href: string;
}

export interface ToolFrontmatter {
  title: string;
  platform: string;
  summary: string;
  status: 'active' | 'beta' | 'research';
  links: ToolLink[];
}

export interface ContentEntry<TFrontmatter> {
  slug: string;
  frontmatter: TFrontmatter;
  body: string;
}
