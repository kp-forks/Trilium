import { BackupDatabaseNowResponse, DatabaseBackup, ExistingBackupsResponse } from "@triliumnext/commons";
import { useCallback, useEffect, useState } from "preact/hooks";

import { t } from "../../../services/i18n";
import server from "../../../services/server";
import toast from "../../../services/toast";
import { formatSize } from "../../../services/utils";
import { formatDateTime } from "../../../utils/formatters";
import ActionButton from "../../react/ActionButton";
import FormText from "../../react/FormText";
import { useTriliumOptionBool } from "../../react/hooks";
import NoItems from "../../react/NoItems";
import OptionsRow, { OptionsRowWithButton, OptionsRowWithToggle } from "./components/OptionsRow";
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
            <BackupConfiguration refreshCallback={refreshBackups} />
            <BackupList backups={backups} backupFolderPath={backupFolderPath} />
        </>
    );
}

export function BackupConfiguration({ refreshCallback }: { refreshCallback: () => void }) {
    const [dailyBackupEnabled, setDailyBackupEnabled] = useTriliumOptionBool("dailyBackupEnabled");
    const [weeklyBackupEnabled, setWeeklyBackupEnabled] = useTriliumOptionBool("weeklyBackupEnabled");
    const [monthlyBackupEnabled, setMonthlyBackupEnabled] = useTriliumOptionBool("monthlyBackupEnabled");

    return (
        <OptionsSection title={t("backup.title")}>
            <FormText>{t("backup.automatic_backup_description")}</FormText>

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

            <FormText>{t("backup.backup_recommendation")}</FormText>

            <hr />

            <OptionsRowWithButton
                label={t("backup.backup_database_now")}
                onClick={async () => {
                    const { backupFile } = await server.post<BackupDatabaseNowResponse>("database/backup-database");
                    toast.showMessage(t("backup.database_backed_up_to", { backupFilePath: backupFile }), 10000);
                    refreshCallback();
                }}
            />
        </OptionsSection>
    );
}

export function BackupList({ backups, backupFolderPath }: { backups: DatabaseBackup[]; backupFolderPath: string | null }) {
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
        </OptionsSection>
    );
}
