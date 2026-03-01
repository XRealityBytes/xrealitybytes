const sharedConfig = [
  {
    ignores: ['**/.next/**', '**/node_modules/**', '**/dist/**', '**/coverage/**'],
  },
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@next/next/no-img-element': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'import/no-anonymous-default-export': 'off',
    },
  },
];

export default sharedConfig;
