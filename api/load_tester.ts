#!/usr/bin/env ts-node

import * as http from "http";
import * as https from "https";
import { URL } from "url";

interface LoadTestConfig {
    url: string;
    queries: any[];
    concurrency: number;
    duration: number; // in seconds
    requestsPerSecond?: number;
}

interface RequestStats {
    success: number;
    errors: number;
    totalTime: number;
    minTime: number;
    maxTime: number;
    statusCodes: Record<number, number>;
    queryTypeStats: Record<string, { count: number; totalTime: number; errors: number }>;
}

class LoadTester {
    private config: LoadTestConfig;
    private stats: RequestStats;
    private startTime: number = 0;
    private requestTimes: number[] = [];
    private isRunning: boolean = false;

    constructor(config: LoadTestConfig) {
        this.config = config;
        this.stats = {
            success: 0,
            errors: 0,
            totalTime: 0,
            minTime: Infinity,
            maxTime: Infinity,
            statusCodes: {},
            queryTypeStats: {},
        };
    }

    private makeRequest(query: any, shouldAbort?: () => boolean): Promise<void> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const url = new URL(this.config.url);
            const isHttps = url.protocol === "https:";
            const client = isHttps ? https : http;

            // Keep identifier field - validation requires it, controller removes it after validation
            const body = JSON.stringify(query);
            const bodyLength = Buffer.byteLength(body);

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": bodyLength,
                },
                timeout: 30000,
            };

            let resolved = false;
            const safeResolve = () => {
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            };

            const req = client.request(options, (res) => {
                let responseData = "";

                res.on("data", (chunk) => {
                    if (shouldAbort?.()) {
                        req.destroy();
                        safeResolve();
                        return;
                    }
                    responseData += chunk.toString();
                });

                res.on("end", () => {
                    if (shouldAbort?.()) {
                        safeResolve();
                        return;
                    }

                    const endTime = Date.now();
                    const duration = endTime - startTime;

                    this.requestTimes.push(duration);
                    this.stats.totalTime += duration;
                    this.stats.minTime = Math.min(this.stats.minTime, duration);
                    this.stats.maxTime = Math.max(this.stats.maxTime, duration);

                    const statusCode = res.statusCode || 0;
                    this.stats.statusCodes[statusCode] =
                        (this.stats.statusCodes[statusCode] || 0) + 1;

                    const queryType = query.selector?.type || "unknown";
                    if (!this.stats.queryTypeStats[queryType]) {
                        this.stats.queryTypeStats[queryType] = {
                            count: 0,
                            totalTime: 0,
                            errors: 0,
                        };
                    }
                    this.stats.queryTypeStats[queryType].count++;
                    this.stats.queryTypeStats[queryType].totalTime += duration;

                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        this.stats.success++;
                    } else {
                        this.stats.errors++;
                        this.stats.queryTypeStats[queryType].errors++;
                        // Only log first few errors to avoid spam
                        if (this.stats.errors <= 5) {
                            try {
                                const errorObj = JSON.parse(responseData);
                                console.error(
                                    `\nError: Status ${statusCode} for query type ${queryType}: ${
                                        errorObj.message || errorObj.error || responseData
                                    }`,
                                );
                            } catch {
                                console.error(
                                    `\nError: Status ${statusCode} for query type ${queryType}: ${
                                        responseData || "No error message"
                                    }`,
                                );
                            }
                        }
                    }

                    safeResolve();
                });
            });

            req.on("error", (error) => {
                if (shouldAbort?.()) {
                    safeResolve();
                    return;
                }

                const endTime = Date.now();
                const duration = endTime - startTime;

                this.requestTimes.push(duration);
                this.stats.totalTime += duration;
                this.stats.errors++;

                const queryType = query.selector?.type || "unknown";
                if (!this.stats.queryTypeStats[queryType]) {
                    this.stats.queryTypeStats[queryType] = {
                        count: 0,
                        totalTime: 0,
                        errors: 0,
                    };
                }
                this.stats.queryTypeStats[queryType].count++;
                this.stats.queryTypeStats[queryType].totalTime += duration;
                this.stats.queryTypeStats[queryType].errors++;

                if (this.stats.errors <= 5) {
                    console.error(`\nRequest error: ${error.message}`);
                }
                safeResolve();
            });

            req.setTimeout(30000, () => {
                if (!req.destroyed) {
                    req.destroy();
                    this.stats.errors++;

                    const queryType = query.selector?.type || "unknown";
                    if (!this.stats.queryTypeStats[queryType]) {
                        this.stats.queryTypeStats[queryType] = {
                            count: 0,
                            totalTime: 0,
                            errors: 0,
                        };
                    }
                    this.stats.queryTypeStats[queryType].count++;
                    this.stats.queryTypeStats[queryType].errors++;

                    if (this.stats.errors <= 5) {
                        console.error("\nRequest timeout after 30s");
                    }
                }
                safeResolve();
            });

            req.write(body);
            req.end();
        });
    }

    private async runWorker(): Promise<void> {
        while (this.isRunning) {
            // Check if we should stop before making a request
            if (!this.isRunning) break;

            // Select a random query from the list
            const query =
                this.config.queries[Math.floor(Math.random() * this.config.queries.length)];

            // Make request with abort check
            await this.makeRequest(query, () => !this.isRunning);

            // Check again before rate limiting
            if (!this.isRunning) break;

            // Rate limiting if specified (per worker, so total rate = rate * concurrency)
            if (this.config.requestsPerSecond) {
                const delay = (1000 * this.config.concurrency) / this.config.requestsPerSecond;
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    async run(): Promise<void> {
        console.log("Starting load test...");
        console.log(`URL: ${this.config.url}`);
        console.log(`Concurrency: ${this.config.concurrency}`);
        console.log(`Duration: ${this.config.duration}s`);
        console.log(`Queries: ${this.config.queries.length} different query types`);
        if (this.config.requestsPerSecond) {
            console.log(`Rate limit: ${this.config.requestsPerSecond} req/s`);
        }
        console.log("");

        // Test connectivity first
        console.log("Testing connectivity...");
        try {
            await Promise.race([
                this.makeRequest(this.config.queries[0], undefined),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Connectivity test timeout")), 10000),
                ),
            ]);
            console.log("✓ Connectivity test passed\n");
        } catch (error: any) {
            console.error("✗ Connectivity test failed:", error.message || error);
            console.error("Please check your URL and network connection.");
            process.exit(1);
        }

        this.isRunning = true;
        this.startTime = Date.now();

        // Start worker threads
        const workers = Array(this.config.concurrency)
            .fill(0)
            .map(() => this.runWorker());

        // Start detailed status updates every 5 seconds
        const statusInterval = setInterval(() => {
            const totalRequests = this.stats.success + this.stats.errors;
            const elapsed = (Date.now() - this.startTime) / 1000;
            const rps = totalRequests / elapsed;
            const avgTime = totalRequests > 0 ? this.stats.totalTime / totalRequests : 0;

            // Calculate percentiles from recent requests (last 1000 or all if less)
            const recentTimes = this.requestTimes.slice(-1000);
            const sortedTimes = [...recentTimes].sort((a, b) => a - b);
            const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
            const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
            const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;

            // Build query type breakdown
            const queryBreakdown = Object.entries(this.stats.queryTypeStats)
                .map(([type, stats]) => {
                    const avg = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(0) : "0";
                    return `${type}:${stats.count}(${avg}ms)`;
                })
                .join(" ");

            // Clear line and print detailed stats
            process.stdout.write(
                `\r[${elapsed.toFixed(0)}s] Req:${totalRequests} ✓:${this.stats.success} ✗:${
                    this.stats.errors
                } | RPS:${rps.toFixed(1)} | Avg:${avgTime.toFixed(0)}ms Median:${p50.toFixed(
                    0,
                )}ms P95:${p95.toFixed(0)}ms 99th:${p99.toFixed(0)}ms`,
            );

            // Print query breakdown on new line every 15 seconds
            if (Math.floor(elapsed) % 15 === 0 && Math.floor(elapsed) > 0) {
                console.log(`\n  Query types: ${queryBreakdown}`);
            }
        }, 5000);

        // Stop after duration
        setTimeout(() => {
            this.isRunning = false;
            clearInterval(statusInterval);
            console.log("\n\nStopping load test...");
        }, this.config.duration * 1000);

        // Wait for all workers to finish with a timeout
        const finishTimeout = setTimeout(
            () => {
                console.error("\n\nWARNING: Workers did not finish in time. Forcing exit.");
                process.exit(1);
            },
            (this.config.duration + 30) * 1000,
        ); // Give 30 seconds extra

        try {
            await Promise.all(workers);
            clearTimeout(finishTimeout);
        } catch (error) {
            clearTimeout(finishTimeout);
            console.error("\n\nError in workers:", error);
        }

        this.printStats();
    }

    private printStats(): void {
        const totalRequests = this.stats.success + this.stats.errors;
        const avgTime = totalRequests > 0 ? this.stats.totalTime / totalRequests : 0;
        const sortedTimes = [...this.requestTimes].sort((a, b) => a - b);
        const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
        const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
        const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;

        const actualDuration = (Date.now() - this.startTime) / 1000;
        const requestsPerSecond = totalRequests / actualDuration;

        console.log("\n" + "=".repeat(60));
        console.log("LOAD TEST RESULTS");
        console.log("=".repeat(60));
        console.log(`Duration: ${actualDuration.toFixed(2)}s`);
        console.log(`Total Requests: ${totalRequests}`);
        console.log(`Successful: ${this.stats.success}`);
        console.log(`Errors: ${this.stats.errors}`);
        console.log(`Success Rate: ${((this.stats.success / totalRequests) * 100).toFixed(2)}%`);
        console.log(`Requests/sec: ${requestsPerSecond.toFixed(2)}`);
        console.log("");
        console.log("Response Times (ms):");
        console.log(`  Min: ${this.stats.minTime === Infinity ? "N/A" : this.stats.minTime}`);
        console.log(`  Max: ${this.stats.maxTime === Infinity ? "N/A" : this.stats.maxTime}`);
        console.log(`  Average: ${avgTime.toFixed(2)}`);
        console.log(`  Median (50th percentile): ${p50.toFixed(2)}`);
        console.log(`  95th percentile: ${p95.toFixed(2)}`);
        console.log(`  99th percentile: ${p99.toFixed(2)}`);
        console.log("");
        console.log("Status Codes:");
        Object.entries(this.stats.statusCodes)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .forEach(([code, count]) => {
                console.log(`  ${code}: ${count}`);
            });
        console.log("");
        console.log("Per Query Type Statistics:");
        Object.entries(this.stats.queryTypeStats)
            .sort(
                ([a], [b]) =>
                    this.stats.queryTypeStats[b].count - this.stats.queryTypeStats[a].count,
            )
            .forEach(([type, stats]) => {
                const avg = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(2) : "0";
                const errorRate =
                    stats.count > 0 ? ((stats.errors / stats.count) * 100).toFixed(2) : "0";
                console.log(
                    `  ${type.padEnd(15)}: ${stats.count
                        .toString()
                        .padStart(6)} requests | Avg: ${avg.padStart(8)}ms | Errors: ${stats.errors
                        .toString()
                        .padStart(4)} (${errorRate}%)`,
                );
            });
        console.log("=".repeat(60));
    }
}

// Query selectors as provided
const queries = [
    {
        selector: {
            type: "language",
            updatedTimeUtc: { $lte: 9007199254740991, $gte: 1760102732933 },
            memberOf: { $elemMatch: { $in: ["group-public-content", "group-languages"] } },
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index: "sync-language-index",
        cms: false,
        identifier: "sync",
    },
    {
        selector: {
            type: "content",
            updatedTimeUtc: { $lte: 9007199254740991, $gte: 1764746910599 },
            memberOf: {
                $elemMatch: {
                    $in: ["group-public-content", "group-languages", "group-private-content"],
                },
            },
            parentType: "post",
            language: {
                $in: ["lang-eng", "lang-fra", "14d07c30-f0a2-4d79-b37b-a957c64859f6", "lang-swa"],
            },
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index: "sync-post-content-index",
        cms: false,
        identifier: "sync",
    },
    {
        selector: {
            type: "content",
            updatedTimeUtc: { $lte: 9007199254740991, $gte: 1764677470620 },
            memberOf: {
                $elemMatch: {
                    $in: [
                        "7f7655bf-09b5-4fb4-93b1-9189dff8af36",
                        "group-public-content",
                        "group-languages",
                        "group-private-content",
                    ],
                },
            },
            parentType: "tag",
            language: {
                $in: ["lang-eng", "lang-fra", "14d07c30-f0a2-4d79-b37b-a957c64859f6", "lang-swa"],
            },
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index: "sync-tag-content-index",
        cms: false,
        identifier: "sync",
    },
    {
        selector: {
            type: "redirect",
            updatedTimeUtc: { $lte: 9007199254740991, $gte: -1000 },
            memberOf: { $elemMatch: { $in: ["group-languages", "group-private-content"] } },
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index: "sync-redirect-index",
        cms: false,
        identifier: "sync",
    },
    {
        selector: {
            type: "deleteCmd",
            updatedTimeUtc: { $lte: 9007199254740991, $gte: 0 },
            memberOf: { $elemMatch: { $in: ["group-languages", "group-private-content"] } },
            docType: "redirect",
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index: "sync-redirect-deleteCmd-index",
        cms: false,
        identifier: "sync",
    },
    {
        selector: {
            type: "deleteCmd",
            updatedTimeUtc: { $lte: 9007199254740991, $gte: 1760102732933 },
            memberOf: { $elemMatch: { $in: ["group-public-content", "group-languages"] } },
            docType: "language",
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index: "sync-language-deleteCmd-index",
        cms: false,
        identifier: "sync",
    },
    {
        selector: {
            type: "deleteCmd",
            updatedTimeUtc: { $lte: 9007199254740991, $gte: 0 },
            memberOf: {
                $elemMatch: {
                    $in: ["group-public-content", "group-languages", "group-private-content"],
                },
            },
            docType: "post",
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index: "sync-post-deleteCmd-index",
        cms: false,
        identifier: "sync",
    },
    {
        selector: {
            type: "deleteCmd",
            updatedTimeUtc: { $lte: 9007199254740991, $gte: 0 },
            memberOf: {
                $elemMatch: {
                    $in: [
                        "7f7655bf-09b5-4fb4-93b1-9189dff8af36",
                        "group-public-content",
                        "group-languages",
                        "group-private-content",
                    ],
                },
            },
            docType: "tag",
        },
        limit: 100,
        sort: [{ updatedTimeUtc: "desc" }],
        use_index: "sync-tag-deleteCmd-index",
        cms: false,
        identifier: "sync",
    },
];

// Parse command line arguments
function parseArgs(): LoadTestConfig {
    const args = process.argv.slice(2);
    const config: LoadTestConfig = {
        url: "http://localhost:3000/query",
        queries: queries,
        concurrency: 10,
        duration: 60,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--url":
            case "-u":
                config.url = args[++i];
                break;
            case "--concurrency":
            case "-c":
                config.concurrency = parseInt(args[++i], 10);
                break;
            case "--duration":
            case "-d":
                config.duration = parseInt(args[++i], 10);
                break;
            case "--rate":
            case "-r":
                config.requestsPerSecond = parseInt(args[++i], 10);
                break;
            case "--help":
            case "-h":
                console.log(`
Load Tester for Luminary API Query Endpoint

Usage: ts-node load_tester.ts [options]

Options:
  -u, --url <url>           API endpoint URL (default: http://localhost:3000/query)
  -c, --concurrency <num>   Number of concurrent requests (default: 10)
  -d, --duration <seconds>  Test duration in seconds (default: 60)
  -r, --rate <req/s>        Rate limit in requests per second (optional)
  -h, --help                Show this help message

Examples:
  ts-node load_tester.ts
  ts-node load_tester.ts --url http://localhost:3000/query --concurrency 20 --duration 120
  ts-node load_tester.ts -u http://localhost:3000/query -c 50 -d 300 -r 100
                `);
                process.exit(0);
                break;
        }
    }

    return config;
}

// Main execution
async function main() {
    const config = parseArgs();
    const tester = new LoadTester(config);
    await tester.run();
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
