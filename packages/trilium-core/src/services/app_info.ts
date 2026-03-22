import build from "./build.js";
import packageJson from "../../package.json" with { type: "json" };
import { AppInfo } from "@triliumnext/commons";

const APP_DB_VERSION = 234;
const SYNC_VERSION = 37;
const CLIPPER_PROTOCOL_VERSION = "1.0";

const appInfo: AppInfo = {
    appVersion: packageJson.version,
    dbVersion: APP_DB_VERSION,
    syncVersion: SYNC_VERSION,
    buildDate: build.buildDate,
    buildRevision: build.buildRevision,
    clipperProtocolVersion: CLIPPER_PROTOCOL_VERSION,
    utcDateTime: new Date().toISOString()
}

export default appInfo;
