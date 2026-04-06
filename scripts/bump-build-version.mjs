import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const appPath = path.join(rootDir, "src", "App.jsx");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const currentVersion = String(packageJson.version || "0.1.0").trim();
const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);

if (!match) {
  throw new Error(`Unsupported version format: ${currentVersion}`);
}

const nextVersion = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
packageJson.version = nextVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

const appSource = fs.readFileSync(appPath, "utf8");
const nextAppSource = appSource.replace(
  /const APP_VERSION = "[^"]+";/,
  `const APP_VERSION = "${nextVersion}";`
);

if (nextAppSource === appSource) {
  throw new Error("Failed to update APP_VERSION in src/App.jsx");
}

fs.writeFileSync(appPath, nextAppSource);
console.log(`Bumped app version to ${nextVersion}`);
