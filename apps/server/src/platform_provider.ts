import { getLog, PlatformProvider } from "@triliumnext/core";

export default class ServerPlatformProvider implements PlatformProvider {
    crash(message: string): void {
        getLog().error(message);
        process.exit(1);
    }

    getEnv(key: string): string | undefined {
        return process.env[key];
    }
}
