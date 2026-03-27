/**
 * Runs `tsc --build` and filters out noisy cascade errors (TS6305).
 * Numbers each remaining error and prints a summary at the end.
 */

import { execSync } from "child_process";

const SUPPRESSED_CODES = [ "TS6305" ];
const ERROR_LINE_PATTERN = /^.+\(\d+,\d+\): error TS\d+:/;

let output: string;
try {
    output = execSync("tsc --build", {
        encoding: "utf-8",
        stdio: [ "inherit", "pipe", "pipe" ]
    });
} catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string };
    output = (execErr.stdout ?? "") + (execErr.stderr ?? "");
}

const lines = output.split(/\r?\n/);
const filtered = lines.filter(
    (line) => !SUPPRESSED_CODES.some((code) => line.includes(code))
);

let errorIndex = 0;
const numbered: string[] = [];

for (const line of filtered) {
    if (ERROR_LINE_PATTERN.test(line)) {
        errorIndex++;
        numbered.push(`[${errorIndex}] ${line}`);
    } else if (line.trim()) {
        // Continuation line (indented context for multi-line errors)
        numbered.push(line);
    }
}

if (errorIndex > 0) {
    console.log(numbered.join("\n"));
    console.log(`\n${errorIndex} error(s) found.`);
    process.exit(1);
} else {
    console.log("No errors found.");
}
