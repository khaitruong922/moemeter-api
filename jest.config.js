module.exports = {
  testMatch: ['**/test/**/*.+(ts|tsx)'],
  transform: {
    '^.+\\.(ts|tsx)$': 'esbuild-jest',
  },
  testEnvironment: 'miniflare',
}