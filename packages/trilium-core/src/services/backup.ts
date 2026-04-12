import type { DatabaseBackup } from "@triliumnext/commons";

/**
 * Base backup service class.
 * Provides default (no-op) implementations.
 * Platform-specific implementations extend this class.
 */
export default class BackupService {
    /**
     * Create a backup with the given name.
     * Returns the backup file path/name.
     */
    async backupNow(name: string): Promise<string> {
        console.warn("Backup not available - no backup provider configured.");
        return `backup-${name}-${new Date().toISOString()}.db`;
    }

    /**
     * Perform regular scheduled backups (daily, weekly, monthly).
     * Called periodically by the scheduler.
     */
    regularBackup(): void {
        // No-op in base implementation
    }

    /**
     * Get list of existing backups.
     * Returns empty array if not supported.
     */
    getExistingBackups(): DatabaseBackup[] {
        return [];
    }
}

let backupService: BackupService = new BackupService();

/**
 * Get the current backup service instance.
 */
export function getBackup(): BackupService {
    return backupService;
}

/**
 * Initialize the backup service with a platform-specific provider.
 */
export function initBackup(provider?: BackupService): void {
    backupService = provider ?? new BackupService();
}
