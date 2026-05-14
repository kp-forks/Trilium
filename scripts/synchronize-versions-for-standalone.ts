import { readFileSync, writeFileSync } from "fs";

function synchronize(targetPackageJsonPath: string, sourcePackageJsonPath: string) {
    const targetPackageJson = JSON.parse(readFileSync(targetPackageJsonPath, "utf-8"));
    const sourcePackageJson = JSON.parse(readFileSync(sourcePackageJsonPath, "utf-8"));

    for (const prefix of ["dependencies", "devDependencies"]) {
        for (const [packageName, version] of Object.entries(sourcePackageJson[prefix] || {})) {
            if (targetPackageJson[prefix] && targetPackageJson[prefix][packageName]) {
                targetPackageJson[prefix][packageName] = version;
            }
        }
    }

    writeFileSync(targetPackageJsonPath, JSON.stringify(targetPackageJson, null, 2));
}

synchronize("packages/trilium-core/package.json", "apps/server/package.json");
synchronize("apps/client-standalone/package.json", "apps/client/package.json");
