import type { DatabaseBackup, OptionNames } from "@triliumnext/commons";
import { getContext } from "./context.js";
import dateUtils from "./utils/date.js";

type BackupType = "daily" | "weekly" | "monthly";

// Lazy-loaded to avoid circular dependency (options -> becca -> entities)
let optionsModule: Awaited<typeof import("./options.js")>["default"] | null = null;

async function getOptions() {
    if (!optionsModule) {
        optionsModule = (await import("./options.js")).default;
    }
    return optionsModule!;
}

/**
 * Abstract backup service class.
 * Platform-specific implementations must extend this class.
 */
export default abstract class BackupService {
    /**
     * Create a backup with the given name.
     * Returns the backup file path/name.
     */
    abstract backupNow(name: string): Promise<string>;

    /**
     * Perform regular scheduled backups (daily, weekly, monthly).
     * Called periodically by the scheduler.
     * Default implementation runs inside an execution context.
     */
    regularBackup(): void {
        getContext().init(() => {
            // Fire and forget - the async work runs in background
            this.runScheduledBackups().catch(err => {
                console.error("[Backup] Error running scheduled backups:", err);
            });
        });
    }

    /**
     * Get list of existing backups.
     */
    abstract getExistingBackups(): DatabaseBackup[];

    /**
     * Run the scheduled backup checks for daily, weekly, and monthly backups.
     * Can be overridden by subclasses if they need custom behavior.
     */
    protected async runScheduledBackups(): Promise<void> {
        await this.periodBackup("lastDailyBackupDate", "daily", 24 * 3600);
        await this.periodBackup("lastWeeklyBackupDate", "weekly", 7 * 24 * 3600);
        await this.periodBackup("lastMonthlyBackupDate", "monthly", 30 * 24 * 3600);
    }

    /**
     * Check if a specific backup type is enabled via options.
     */
    protected async isBackupEnabled(backupType: BackupType): Promise<boolean> {
        const options = await getOptions();
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

        return options.getOptionBool(optionName);
    }

    /**
     * Check if a periodic backup is due and create it if so.
     */
    protected async periodBackup(
        optionName: "lastDailyBackupDate" | "lastWeeklyBackupDate" | "lastMonthlyBackupDate",
        backupType: BackupType,
        periodInSeconds: number
    ): Promise<void> {
        if (!(await this.isBackupEnabled(backupType))) {
            return;
        }

        const options = await getOptions();

        const now = new Date();
        const lastBackupDate = dateUtils.parseDateTime(options.getOption(optionName));

        if (now.getTime() - lastBackupDate.getTime() > periodInSeconds * 1000) {
            await this.backupNow(backupType);
            options.setOption(optionName, dateUtils.utcNowDateTime());
        }
    }
}

let backupService: BackupService | undefined;

/**
 * Get the current backup service instance.
 * Throws if no provider has been initialized.
 */
export function getBackup(): BackupService {
    if (!backupService) {
        throw new Error("Backup service not initialized. Call initBackup() first.");
    }
    return backupService;
}

/**
 * Initialize the backup service with a platform-specific provider.
 */
export function initBackup(provider: BackupService): void {
    backupService = provider;
}
