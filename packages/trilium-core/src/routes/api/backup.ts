import type { BackupDatabaseNowResponse, DatabaseBackup } from "@triliumnext/commons";
import { getBackup } from "../../services/backup.js";

async function getExistingBackups(): Promise<DatabaseBackup[]> {
    return getBackup().getExistingBackups();
}

async function backupDatabase(): Promise<BackupDatabaseNowResponse> {
    return {
        backupFile: await getBackup().backupNow("now")
    };
}

interface DownloadRequest {
    query: { filePath?: string };
}

interface DownloadResponse {
    status(code: number): DownloadResponse;
    send(body: string): void;
    set(name: string, value: string): DownloadResponse;
}

async function downloadBackup(req: DownloadRequest, res: DownloadResponse): Promise<void> {
    const filePath = req.query.filePath;
    if (!filePath) {
        res.status(400).send("Missing filePath");
        return;
    }

    const content = await getBackup().getBackupContent(filePath);
    if (!content) {
        res.status(404).send("Backup not found");
        return;
    }

    const fileName = filePath.split("/").pop() || "backup.db";
    res.set("Content-Type", "application/x-sqlite3");
    res.set("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(content as unknown as string);
}

export default {
    getExistingBackups,
    backupDatabase,
    downloadBackup
};
