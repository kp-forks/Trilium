export default class LogService {

    log(message: string | Error) {
        console.log(message);
    }

    info(message: string | Error) {
        console.info(message);
    }

    error(message: string | Error | unknown) {
        console.error("ERROR: ", message);
    }

    banner(message: string | undefined) {
        if (!message) return;
        const maxContent = 76; // 80 - 4 (border + padding)
        const words = message.split(" ");
        const lines: string[] = [];
        let current = "";

        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length > maxContent) {
                if (current) lines.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }
        if (current) lines.push(current);

        const width = Math.min(Math.max(...lines.map((l) => l.length)), maxContent) + 4;
        const top = `╔${"═".repeat(width)}╗`;
        const mid = lines.map((l) => `║  ${l.padEnd(width - 4)}  ║`).join("\n");
        const bot = `╚${"═".repeat(width)}╝`;
        console.log(`\n${top}\n${mid}\n${bot}\n`);
    }

}

let log: LogService;

export function initLog() {
    log = new LogService();
}

export function getLog() {
    if (!log) throw new Error("Log service not initialized.");
    return log;
}
