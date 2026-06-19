import config from "./config.js";
import { isElectron } from "./utils.js";

function getHost() {
    const envHost = process.env.TRILIUM_HOST;
    if (envHost && !isElectron) {
        return envHost;
    }

    // `config.Network.host` resolves the standard env var, then config.ini, then
    // a platform-aware default — loopback on desktop (the renderer reaches the
    // server in-process via `trilium-app://`, so the listener can stay off the
    // LAN as defense in depth), all interfaces on server. A user who wants LAN
    // access sets `[Network] host=` in config.ini. See `configMapping.Network.host`.
    return config["Network"]["host"];
}

export default getHost();
