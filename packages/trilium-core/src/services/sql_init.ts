import { deferred } from "@triliumnext/commons";

export const dbReady = deferred<void>();

// TODO: Proper impl.
setTimeout(() => {
    dbReady.resolve();
}, 850);

function isDbInitialized() {
    return true;
}

async function createDatabaseForSync(a: any, b: string, c: any) {
    console.error("createDatabaseForSync is not implemented yet");
}

function setDbAsInitialized() {
    // Noop.
}

function schemaExists() {
    return true;
}

function getDbSize() {
    return 1000;
}

export default { isDbInitialized, createDatabaseForSync, setDbAsInitialized, schemaExists, getDbSize, dbReady };
