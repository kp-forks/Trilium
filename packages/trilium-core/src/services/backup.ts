import type { DatabaseBackup } from "@triliumnext/commons";

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
     */
    abstract regularBackup(): void;

    /**
     * Get list of existing backups.
     */
    abstract getExistingBackups(): DatabaseBackup[];
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
