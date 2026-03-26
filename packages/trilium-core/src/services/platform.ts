/**
 * Interface for platform-specific services. This is used to abstract away platform-specific implementations, such as crash reporting, from the core logic of the application.
 */
export interface PlatformProvider {
    crash(message: string): void;
}

let platformProvider: PlatformProvider | null = null;

export function initPlatform(provider: PlatformProvider) {
    platformProvider = provider;
}

export function getPlatform(): PlatformProvider {
    if (!platformProvider) throw new Error("Platform provider not initialized");
    return platformProvider;
}
