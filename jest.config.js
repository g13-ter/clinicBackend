/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  testTimeout: 15000,
  setupFiles: ["<rootDir>/tests/jest.setup.ts"],
  // run test files one at a time, not in parallel -
  // since they all share the same real database, running them
  // at the same time could cause them to interfere with each other
  maxWorkers: 1,
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.test.json"
    }
  }
};