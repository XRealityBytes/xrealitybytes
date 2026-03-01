import type { AnchorHTMLAttributes, ReactNode } from 'react';

import Link from 'next/link';

type AnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children?: ReactNode;
};

export const mdxComponents = {
  a: ({ href = '', children, ...props }: AnchorProps) => {
    if (href.startsWith('/')) {
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      );
    }

    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  },
};
