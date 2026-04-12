import { LogService } from "@triliumnext/core";
import type { Request, Response } from "express";
import fs from "fs";
import { EOL } from "os";
import path from "path";

import cls from "./services/cls.js";
import config, { LOGGING_DEFAULT_RETENTION_DAYS } from "./services/config.js";
import dataDir from "./services/data_dir.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MINIMUM_FILES_TO_KEEP = 7;

const requestBlacklist = ["/app", "/images", "/stylesheets", "/api/recent-notes"];

export default class ServerLogService extends LogService {
    private logFile: fs.WriteStream | undefined;
    private todaysMidnight!: Date;

    constructor() {
        super();
        fs.mkdirSync(dataDir.LOG_DIR, { recursive: true, mode: 0o700 });
        this.initLogFile();
    }

    private getTodaysMidnight() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    private async cleanupOldLogFiles() {
        try {
            let retentionDays = LOGGING_DEFAULT_RETENTION_DAYS;
            const customRetentionDays = config.Logging.retentionDays;
            if (customRetentionDays > 0) {
                retentionDays = customRetentionDays;
            } else if (customRetentionDays <= -1) {
                this.info("Log cleanup: keeping all log files, as specified by configuration.");
                return;
            }

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            const files = await fs.promises.readdir(dataDir.LOG_DIR);
            const logFiles: Array<{ name: string; mtime: Date; path: string }> = [];

            for (const file of files) {
                if (!/^trilium-\d{4}-\d{2}-\d{2}\.log$/.test(file)) {
                    continue;
                }

                const filePath = path.join(dataDir.LOG_DIR, file);
                const resolvedPath = path.resolve(filePath);
                const resolvedLogDir = path.resolve(dataDir.LOG_DIR);
                if (!resolvedPath.startsWith(resolvedLogDir + path.sep)) {
                    continue;
                }

                try {
                    const stats = await fs.promises.stat(filePath);
                    logFiles.push({ name: file, mtime: stats.mtime, path: filePath });
                } catch {
                    // Skip files we can't stat
                }
            }

            logFiles.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

            if (logFiles.length <= MINIMUM_FILES_TO_KEEP) {
                return;
            }

            let deletedCount = 0;
            for (let i = 0; i < logFiles.length - MINIMUM_FILES_TO_KEEP; i++) {
                const file = logFiles[i];
                if (file.mtime < cutoffDate) {
                    try {
                        await fs.promises.unlink(file.path);
                        deletedCount++;
                    } catch {
                        // Log deletion failed, but continue with others
                    }
                }
            }

            if (deletedCount > 0) {
                this.info(`Log cleanup: deleted ${deletedCount} old log files`);
            }
        } catch {
            // Cleanup failed, but don't crash the log rotation
        }
    }

    private initLogFile() {
        this.todaysMidnight = this.getTodaysMidnight();

        const logPath = `${dataDir.LOG_DIR}/trilium-${this.formatDate()}.log`;
        const isRotating = !!this.logFile;

        if (isRotating) {
            this.logFile!.end();
        }

        this.logFile = fs.createWriteStream(logPath, { flags: "a" });

        if (isRotating) {
            this.cleanupOldLogFiles().catch(() => {
                // Ignore cleanup errors
            });
        }
    }

    private checkDate(millisSinceMidnight: number) {
        if (millisSinceMidnight >= DAY) {
            this.initLogFile();
            millisSinceMidnight -= DAY;
        }
        return millisSinceMidnight;
    }

    override log(message: string | Error) {
        const bundleNoteId = cls.get("bundleNoteId");
        let str = String(message);

        if (bundleNoteId) {
            str = `[Script ${bundleNoteId}] ${str}`;
        }

        let millisSinceMidnight = Date.now() - this.todaysMidnight.getTime();
        millisSinceMidnight = this.checkDate(millisSinceMidnight);

        this.logFile!.write(`${this.formatTime(millisSinceMidnight)} ${str}${EOL}`);
        console.log(str);
    }

    override info(message: string | Error) {
        this.log(message);
    }

    override error(message: string | Error | unknown) {
        const str = message instanceof Error ? message.stack || message.message : String(message);
        this.log(`ERROR: ${str}`);
    }

    request(req: Request, res: Response, timeMs: number, responseLength: number | string = "?") {
        for (const bl of requestBlacklist) {
            if (req.url.startsWith(bl)) {
                return;
            }
        }

        if (req.url.includes(".js.map") || req.url.includes(".css.map")) {
            return;
        }

        this.info(`${timeMs >= 10 ? "Slow " : ""}${res.statusCode} ${req.method} ${req.url} with ${responseLength} bytes took ${timeMs}ms`);
    }

    override getLogContents(): string | null {
        const fileName = `trilium-${this.formatDate()}.log`;
        const filePath = path.join(dataDir.LOG_DIR, fileName);
        try {
            return fs.readFileSync(filePath, "utf8");
        } catch {
            return null;
        }
    }

    private pad(num: number) {
        num = Math.floor(num);
        return num < 10 ? `0${num}` : num.toString();
    }

    private padMilli(num: number) {
        if (num < 10) {
            return `00${num}`;
        } else if (num < 100) {
            return `0${num}`;
        }
        return num.toString();
    }

    private formatTime(millisSinceMidnight: number) {
        return `${this.pad(millisSinceMidnight / HOUR)}:${this.pad((millisSinceMidnight % HOUR) / MINUTE)}:${this.pad((millisSinceMidnight % MINUTE) / SECOND)}.${this.padMilli(millisSinceMidnight % SECOND)}`;
    }

    private formatDate() {
        return `${this.pad(this.todaysMidnight.getFullYear())}-${this.pad(this.todaysMidnight.getMonth() + 1)}-${this.pad(this.todaysMidnight.getDate())}`;
    }
}
