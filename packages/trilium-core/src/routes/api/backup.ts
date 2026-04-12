import type { BackupDatabaseNowResponse, DatabaseBackup } from "@triliumnext/commons";
import { getBackup } from "../../services/backup.js";

function getExistingBackups(): DatabaseBackup[] {
    return getBackup().getExistingBackups();
}

async function backupDatabase(): Promise<BackupDatabaseNowResponse> {
    return {
        backupFile: await getBackup().backupNow("now")
    };
}

export default {
    getExistingBackups,
    backupDatabase
};
