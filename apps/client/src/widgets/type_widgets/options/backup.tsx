import { BackupDatabaseNowResponse, DatabaseBackup, ExistingBackupsResponse } from "@triliumnext/commons";
import { useCallback, useEffect, useState } from "preact/hooks";

import { t } from "../../../services/i18n";
import server from "../../../services/server";
import toast from "../../../services/toast";
import { formatSize } from "../../../services/utils";
import { formatDateTime } from "../../../utils/formatters";
import ActionButton from "../../react/ActionButton";
import Button from "../../react/Button";
import { useTriliumOptionBool } from "../../react/hooks";
import NoItems from "../../react/NoItems";
import OptionsRow, { OptionsRowWithToggle } from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

export default function BackupSettings() {
    const [backups, setBackups] = useState<DatabaseBackup[]>([]);
    const [backupFolderPath, setBackupFolderPath] = useState<string | null>(null);

    const refreshBackups = useCallback(() => {
        server.get<ExistingBackupsResponse>("database/backups").then((response) => {
            // Sort the backup files by modification date & time in a desceding order
            const backupFiles = [...response.backups].sort((a, b) => {
                if (a.mtime < b.mtime) return 1;
                if (a.mtime > b.mtime) return -1;
                return 0;
            });

            setBackups(backupFiles);
            setBackupFolderPath(response.backupFolderPath);
        });
    }, []);

    useEffect(refreshBackups, []);

    return (
        <>
            <BackupConfiguration />
            <BackupList backups={backups} backupFolderPath={backupFolderPath} refreshCallback={refreshBackups} />
        </>
    );
}

export function BackupConfiguration() {
    const [dailyBackupEnabled, setDailyBackupEnabled] = useTriliumOptionBool("dailyBackupEnabled");
    const [weeklyBackupEnabled, setWeeklyBackupEnabled] = useTriliumOptionBool("weeklyBackupEnabled");
    const [monthlyBackupEnabled, setMonthlyBackupEnabled] = useTriliumOptionBool("monthlyBackupEnabled");

    return (
        <OptionsSection
            title={t("backup.automatic_backups_title")}
            description={t("backup.automatic_backups_description")}
        >
            <OptionsRowWithToggle
                name="daily-backup-enabled"
                label={t("backup.enable_daily_backup")}
                currentValue={dailyBackupEnabled}
                onChange={setDailyBackupEnabled}
            />

            <OptionsRowWithToggle
                name="weekly-backup-enabled"
                label={t("backup.enable_weekly_backup")}
                currentValue={weeklyBackupEnabled}
                onChange={setWeeklyBackupEnabled}
            />

            <OptionsRowWithToggle
                name="monthly-backup-enabled"
                label={t("backup.enable_monthly_backup")}
                currentValue={monthlyBackupEnabled}
                onChange={setMonthlyBackupEnabled}
            />
        </OptionsSection>
    );
}

export function BackupList({ backups, backupFolderPath, refreshCallback }: { backups: DatabaseBackup[]; backupFolderPath: string | null; refreshCallback: () => void }) {
    const [backupInProgress, setBackupInProgress] = useState(false);

    return (
        <OptionsSection
            title={t("backup.existing_backups")}
            description={backupFolderPath && (
                <span className="selectable-text">{t("backup.backup_location_description", { backupFolder: backupFolderPath })}</span>
            )}
        >
            {backups.length > 0 ? (
                backups.map(({ fileName, filePath, mtime, fileSize }) => (
                    <OptionsRow
                        key={filePath}
                        name="existing-backup"
                        label={<span className="selectable-text">{fileName}</span>}
                        description={`${mtime ? formatDateTime(mtime) : "-"} • ${formatSize(fileSize)}`}
                    >
                        <a href={`api/database/backup/download?filePath=${encodeURIComponent(filePath)}`} download>
                            <ActionButton icon="bx bx-download" text={t("backup.download")} />
                        </a>
                    </OptionsRow>
                ))
            ) : (
                <NoItems icon="bx bx-archive" text={t("backup.no_backup_yet")} />
            )}

            <OptionsRow name="backup-now" centered>
                <Button
                    name="backup-database-now-button"
                    text={t("backup.backup_database_now")}
                    size="micro"
                    disabled={backupInProgress}
                    onClick={async () => {
                        setBackupInProgress(true);
                        try {
                            const { backupFile } = await server.post<BackupDatabaseNowResponse>("database/backup-database");
                            toast.showMessage(t("backup.database_backed_up_to", { backupFilePath: backupFile }), 10000);
                            refreshCallback();
                        } finally {
                            setBackupInProgress(false);
                        }
                    }}
                />
            </OptionsRow>
        </OptionsSection>
    );
}
