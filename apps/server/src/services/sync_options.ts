

import config from "./config.js";
import optionService from "./options.js";
import { normalizeUrl } from "./utils.js";

/*
 * Primary configuration for sync is in the options (document), but we allow to override
 * these settings in config file. The reason for that is to avoid a mistake of loading a live/production
 * document with live sync settings in a dev/debug environment. Changes would then successfully propagate
 * to live sync server.
 */

function get(name: keyof typeof config.Sync) {
    return (config["Sync"] && config["Sync"][name]) || optionService.getOption(name);
}

export default {
    // env variable is the easiest way to guarantee we won't overwrite prod data during development
    // after copying prod document/data directory
    getSyncServerHost: () => {
        const host = get("syncServerHost");
        return host ? normalizeUrl(host) : host;
    },
    isSyncSetup: () => {
        const syncServerHost = get("syncServerHost");

        // special value "disabled" is here to support a use case where the document is configured with sync server,
        // and we need to override it with config from config.ini
        return !!syncServerHost && syncServerHost !== "disabled";
    },
    // Value is stored with a time scale, convert to milliseconds for use
    getSyncTimeout: () => {
        const value = parseInt(get("syncServerTimeout"), 10) || 2;
        const scale = parseInt(optionService.getOption("syncServerTimeoutTimeScale"), 10) || 60;
        return value * scale * 1000;
    },
    getSyncProxy: () => get("syncProxy")
};
