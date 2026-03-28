export default {
    async backupNow(name: string) {
        console.warn("Backup not yet available.");
        return "backup-" + name + "-" + new Date().toISOString() + ".zip";
    }
}
