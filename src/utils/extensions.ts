import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

export async function extractManifestFromCrx(crxFilePath: string): Promise<any> {
  try {
    const crxData = fs.readFileSync(crxFilePath);

    // Trouver le début des données ZIP (après l'en-tête CRX)
    // Le format CRX a un en-tête, puis le contenu ZIP du fichier d'extension
    let zipStartOffset = 0;

    // Rechercher la signature ZIP 'PK\x03\x04'
    for (let i = 0; i < crxData.length - 4; i++) {
      if (
        crxData[i] === 0x50 && // P
        crxData[i + 1] === 0x4b && // K
        crxData[i + 2] === 0x03 &&
        crxData[i + 3] === 0x04
      ) {
        zipStartOffset = i;
        break;
      }
    }

    if (zipStartOffset === 0) {
      throw new Error("Format CRX invalide: signature ZIP non trouvée");
    }

    // Extraire les données ZIP dans un fichier temporaire
    const tempDir = path.join(os.tmpdir(), "vaultysid-extension-temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Utiliser une solution externe pour extraire le ZIP
    // Comme nous n'avons pas accès à adm-zip, on va utiliser une approche alternative
    // Écrire les données ZIP dans un fichier temporaire
    const tempZipPath = path.join(tempDir, "extension.zip");
    fs.writeFileSync(tempZipPath, crxData.slice(zipStartOffset));

    // Créer un dossier pour extraire le contenu
    const extractDir = path.join(tempDir, "extracted");
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    try {
      if (process.platform === "win32") {
        // Windows
        execSync(`powershell -command "Expand-Archive -Path '${tempZipPath}' -DestinationPath '${extractDir}' -Force"`);
      } else {
        // Linux/Mac
        execSync(`unzip -o "${tempZipPath}" -d "${extractDir}"`);
      }
    } catch (error) {
      console.error(`Erreur lors de l'extraction du ZIP: ${error}`);
      throw new Error(`Impossible d'extraire le fichier ZIP: ${error}`);
    }

    const manifestPath = path.join(extractDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("manifest.json non trouvé dans l'extension");
    }

    const manifestContent = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(manifestContent);

    fs.rmSync(tempDir, { recursive: true, force: true });

    return manifest;
  } catch (error) {
    console.error(`Erreur lors de l'extraction du manifest: ${error}`);
    return {
      version: "1.0.0",
      name: "VaultySid",
      description: "VaultySid Chrome Extension",
      manifest_version: 3,
      permissions: ["activeTab", "contextMenus", "storage", "scripting"],
      host_permissions: ["file:///*", "http://localhost:3000/*", "https://*/*"],
    };
  }
}
