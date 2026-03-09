import type { Config } from "jest";

const config: Config = {
    moduleFileExtensions: ["js", "json", "ts"],
    rootDir: "src",
    testRegex: ".*\\.spec\\.ts$",
    transform: {
        "^.+\\.(t|j)s$": "ts-jest",
    },
    transformIgnorePatterns: ["/node_modules/(?!jose|jwks-rsa)/"],
    moduleNameMapper: {
        "^src/(.*)$": "<rootDir>/$1",
    },
    collectCoverageFrom: ["**/*.(t|j)s"],
    coverageDirectory: "../coverage",
    testEnvironment: "node",
};

export default config;
