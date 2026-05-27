import NodeRequestProvider, { type Client, type ClientOpts } from "@triliumnext/server/src/services/request.js";
import electron from "electron";

/**
 * Desktop variant of NodeRequestProvider that prefers Electron's `net` module
 * for requests without an explicit proxy. Electron's net respects the system
 * proxy configuration (PAC, environment), whereas Node's http(s) does not —
 * so the sync client gets transparent system-proxy support out of the box.
 *
 * When an explicit proxy IS set (sync options), we fall through to Node's
 * http(s) since Electron's net has no straightforward way to be configured
 * with a custom proxy.
 */
export default class ElectronRequestProvider extends NodeRequestProvider {
    protected async getClient(opts: ClientOpts): Promise<Client> {
        if (!opts.proxy) {
            return electron.net as unknown as Client;
        }
        return super.getClient(opts);
    }
}
