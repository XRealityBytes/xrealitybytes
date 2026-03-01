'use client';

import type { PropsWithChildren } from 'react';

import { motion } from 'framer-motion';

type RevealProps = PropsWithChildren<{
  delay?: number;
  className?: string;
}>;

export function Reveal({ delay = 0, className, children }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.35, delay }}
    >
      {children}
    </motion.div>
  );
}
