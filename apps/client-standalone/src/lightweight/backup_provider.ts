import type { DatabaseBackup } from "@triliumnext/commons";
import { BackupService, getSql } from "@triliumnext/core";

const BACKUP_DIR_NAME = "backups";
const BACKUP_FILE_PATTERN = /^backup-.*\.db$/;

/**
 * Standalone backup service using OPFS (Origin Private File System).
 * Stores database backups as serialized byte arrays in OPFS.
 * Falls back to no-op behavior when OPFS is not available (e.g., in tests).
 */
export default class StandaloneBackupService extends BackupService {
    private backupDir: FileSystemDirectoryHandle | null = null;
    private opfsAvailable: boolean | null = null;

    private isOpfsAvailable(): boolean {
        if (this.opfsAvailable === null) {
            this.opfsAvailable = typeof navigator !== "undefined"
                && navigator.storage
                && typeof navigator.storage.getDirectory === "function";
        }
        return this.opfsAvailable;
    }

    private async ensureBackupDirectory(): Promise<FileSystemDirectoryHandle | null> {
        if (!this.isOpfsAvailable()) {
            return null;
        }

        if (!this.backupDir) {
            const root = await navigator.storage.getDirectory();
            this.backupDir = await root.getDirectoryHandle(BACKUP_DIR_NAME, { create: true });
        }
        return this.backupDir;
    }

    override async backupNow(name: string): Promise<string> {
        const fileName = `backup-${name}.db`;

        // Check if OPFS is available
        if (!this.isOpfsAvailable()) {
            console.warn(`[Backup] OPFS not available, skipping backup: ${fileName}`);
            return `/${BACKUP_DIR_NAME}/${fileName}`;
        }

        try {
            const dir = await this.ensureBackupDirectory();
            if (!dir) {
                console.warn(`[Backup] Backup directory not available, skipping: ${fileName}`);
                return `/${BACKUP_DIR_NAME}/${fileName}`;
            }

            // Serialize the database
            const data = getSql().serialize();

            // Write to OPFS (convert to Blob for compatibility)
            const fileHandle = await dir.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(new Blob([data]));
            await writable.close();

            console.log(`[Backup] Created backup: ${fileName} (${data.byteLength} bytes)`);
            return `/${BACKUP_DIR_NAME}/${fileName}`;
        } catch (error) {
            console.error(`[Backup] Failed to create backup ${fileName}:`, error);
            // Don't throw - backup failure shouldn't block operations
            return `/${BACKUP_DIR_NAME}/${fileName}`;
        }
    }

    override regularBackup(): void {
        // For standalone, we don't implement scheduled backups yet
        // since we don't have easy access to the options service for
        // checking daily/weekly/monthly settings.
        // Manual backups via backupNow() still work.
    }

    override getExistingBackups(): DatabaseBackup[] {
        // This method is synchronous in the interface, but OPFS is async.
        // Return empty array - the UI can use an async method if needed.
        // A future improvement could cache the backup list.
        return [];
    }

    /**
     * Async version of getExistingBackups for use in standalone UI.
     */
    async getExistingBackupsAsync(): Promise<DatabaseBackup[]> {
        if (!this.isOpfsAvailable()) {
            return [];
        }

        try {
            const dir = await this.ensureBackupDirectory();
            if (!dir) {
                return [];
            }

            const backups: DatabaseBackup[] = [];

            for await (const [name, handle] of dir.entries()) {
                if (handle.kind !== "file" || !BACKUP_FILE_PATTERN.test(name)) {
                    continue;
                }

                // OPFS doesn't provide mtime, so we parse from filename or use current time
                const file = await (handle as FileSystemFileHandle).getFile();
                backups.push({
                    fileName: name,
                    filePath: `/${BACKUP_DIR_NAME}/${name}`,
                    mtime: new Date(file.lastModified)
                });
            }

            // Sort by modification time, newest first
            backups.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
            return backups;
        } catch (error) {
            console.error("[Backup] Failed to list backups:", error);
            return [];
        }
    }

    /**
     * Delete a backup by filename.
     */
    async deleteBackup(fileName: string): Promise<void> {
        if (!this.isOpfsAvailable()) {
            return;
        }

        try {
            const dir = await this.ensureBackupDirectory();
            if (!dir) {
                return;
            }
            await dir.removeEntry(fileName);
            console.log(`[Backup] Deleted backup: ${fileName}`);
        } catch (error) {
            console.error(`[Backup] Failed to delete backup ${fileName}:`, error);
        }
    }

    /**
     * Download a backup to the user's device.
     */
    async downloadBackup(fileName: string): Promise<void> {
        if (!this.isOpfsAvailable()) {
            throw new Error("OPFS not available - cannot download backup");
        }

        try {
            const dir = await this.ensureBackupDirectory();
            if (!dir) {
                throw new Error("Backup directory not available");
            }

            const fileHandle = await dir.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            const data = await file.arrayBuffer();

            // Create download link
            const blob = new Blob([data], { type: "application/x-sqlite3" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(`[Backup] Failed to download backup ${fileName}:`, error);
            throw error;
        }
    }
}
