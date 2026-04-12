import type { DatabaseBackup, OptionNames } from "@triliumnext/commons";
import { BackupService, sync_mutex as syncMutexService } from "@triliumnext/core";
import fs from "fs";
import path from "path";

import cls from "./services/cls.js";
import dataDir from "./services/data_dir.js";
import dateUtils from "./services/date_utils.js";
import log from "./services/log.js";
import optionService from "./services/options.js";
import sql from "./services/sql.js";

type BackupType = "daily" | "weekly" | "monthly";

export default class ServerBackupService extends BackupService {
    override getExistingBackups(): DatabaseBackup[] {
        if (!fs.existsSync(dataDir.BACKUP_DIR)) {
            return [];
        }

        return fs
            .readdirSync(dataDir.BACKUP_DIR)
            .filter((fileName) => fileName.includes("backup"))
            .map((fileName) => {
                const filePath = path.resolve(dataDir.BACKUP_DIR, fileName);
                const stat = fs.statSync(filePath);

                return { fileName, filePath, mtime: stat.mtime };
            });
    }

    override regularBackup(): void {
        cls.init(() => {
            this.periodBackup("lastDailyBackupDate", "daily", 24 * 3600);
            this.periodBackup("lastWeeklyBackupDate", "weekly", 7 * 24 * 3600);
            this.periodBackup("lastMonthlyBackupDate", "monthly", 30 * 24 * 3600);
        });
    }

    private isBackupEnabled(backupType: BackupType): boolean {
        let optionName: OptionNames;
        switch (backupType) {
            case "daily":
                optionName = "dailyBackupEnabled";
                break;
            case "weekly":
                optionName = "weeklyBackupEnabled";
                break;
            case "monthly":
                optionName = "monthlyBackupEnabled";
                break;
        }

        return optionService.getOptionBool(optionName);
    }

    private periodBackup(
        optionName: "lastDailyBackupDate" | "lastWeeklyBackupDate" | "lastMonthlyBackupDate",
        backupType: BackupType,
        periodInSeconds: number
    ): void {
        if (!this.isBackupEnabled(backupType)) {
            return;
        }

        const now = new Date();
        const lastBackupDate = dateUtils.parseDateTime(optionService.getOption(optionName));

        if (now.getTime() - lastBackupDate.getTime() > periodInSeconds * 1000) {
            this.backupNow(backupType);
            optionService.setOption(optionName, dateUtils.utcNowDateTime());
        }
    }

    override async backupNow(name: string): Promise<string> {
        // we don't want to back up DB in the middle of sync with potentially inconsistent DB state
        return await syncMutexService.doExclusively(async () => {
            const backupFile = path.resolve(`${dataDir.BACKUP_DIR}/backup-${name}.db`);

            if (!fs.existsSync(dataDir.BACKUP_DIR)) {
                fs.mkdirSync(dataDir.BACKUP_DIR, 0o700);
            }

            log.info("Creating backup...");
            await sql.copyDatabase(backupFile);
            log.info(`Created backup at ${backupFile}`);

            return backupFile;
        });
    }
}
