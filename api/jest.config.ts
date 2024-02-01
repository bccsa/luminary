import type { Config } from "jest";

const config: Config = {
    globalSetup: "<rootDir>/../jest.setup.ts",
    globalTeardown: "<rootDir>/../jest.teardown.ts",
    moduleFileExtensions: ["js", "json", "ts"],
    rootDir: "src",
    testRegex: ".*\\.spec\\.ts$",
    transform: {
        "^.+\\.(t|j)s$": "ts-jest",
    },
    collectCoverageFrom: ["**/*.(t|j)s"],
    coverageDirectory: "../coverage",
    testEnvironment: "node",
};

export default config;
