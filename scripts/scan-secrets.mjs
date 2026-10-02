import { execFileSync, spawnSync } from "node:child_process";
// Scan every tracked file, including dotfiles and the lockfile. No allowlist.
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
if (!files.length)
  throw new Error("No tracked files to scan. Stage the public files first.");
const result = spawnSync(
  "node_modules/.bin/secretlint",
  ["--format", "json", ...files],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
if (result.error) throw result.error;
let reports;
try {
  reports = JSON.parse(result.stdout);
} catch {
  throw new Error("Secretlint did not return a valid report; scanning failed.");
}
let count = 0;
for (const report of reports) {
  for (const message of report.messages || []) {
    count++;
    // Never print matched values or diagnostic messages containing secrets.
    console.error(
      `${report.filePath}: ${message.ruleId}, line ${message.loc?.start?.line ?? "?"}`,
    );
  }
}
console.log(`Secretlint: ${files.length} tracked files, ${count} findings.`);
process.exitCode = result.status ?? 1;
