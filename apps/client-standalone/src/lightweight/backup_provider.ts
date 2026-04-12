import { BackupService } from "@triliumnext/core";

/**
 * No-op backup service for standalone.
 * Backups are not yet implemented in standalone mode.
 */
export default class NoopBackupService extends BackupService {
    override async backupNow(name: string): Promise<string> {
        console.warn("Backup not available in standalone mode.");
        return `backup-${name}-${new Date().toISOString()}.db`;
    }

    override regularBackup(): void {
        // No-op - scheduled backups not available in standalone
    }

    override getExistingBackups(): [] {
        return [];
    }
}
