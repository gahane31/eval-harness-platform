/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/main.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.cjs'],
  globalSetup: '<rootDir>/test/global-setup.cjs',
  globalTeardown: '<rootDir>/test/global-teardown.cjs',
  maxWorkers: 1,
  testTimeout: 30000,
};
