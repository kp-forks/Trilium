/**
 * Filters out TS6305 cascade errors from tsc --build output.
 * These "Output file has not been built from source" errors are noise
 * caused by upstream build failures and obscure the real errors.
 */

const SUPPRESSED_CODES = ["TS6305"];

let data = "";
process.stdin.resume();
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
    const filtered = data
        .split(/\r?\n/)
        .filter((line) => !SUPPRESSED_CODES.some((code) => line.includes(code)))
        .join("\n")
        .trim();

    if (filtered) {
        console.log(filtered);
        process.exit(1);
    }
});
