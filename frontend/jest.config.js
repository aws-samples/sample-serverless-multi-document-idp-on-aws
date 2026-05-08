/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/models/**/*.spec.ts',
    '**/services/**/*.spec.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
    }],
  },
  moduleNameMapper: {
    // Mock the aws-config.json import used by api.service.ts (via generateClient)
    '^.*/config/aws-config\\.json$': '<rootDir>/src/config/aws-config.template.json',
  },
};
