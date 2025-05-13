import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { extractManifestFromCrx } from "./extensions";
import { execSync } from "child_process";
import { BrowserController } from "./browser";
import { InstallerOptions } from "../type";
import { createLogger } from "./logger";

export class Opera {
  options: InstallerOptions;
  userHomeDir: string;
  private logger: ReturnType<typeof createLogger>;

  constructor(options: InstallerOptions = {}) {
    this.options = {
      profiles: options.profiles ?? undefined,
      installDir: options.installDir ?? undefined,
      downloadDir:
        options.downloadDir ??
        path.join(os.tmpdir(), "vaultysid-extension-download"),
      forceReinstall: options.forceReinstall ?? false,
      logLevel: options.logLevel ?? "info",
      pinExtension: options.pinExtension ?? false,
      config: options.config,
    };

    this.logger = createLogger({
      logLevel: this.options.logLevel,
      name: "Opera",
    });

    this.userHomeDir = os.homedir();

    // Create download directory if it doesn't exist
    if (this.options.downloadDir && !fs.existsSync(this.options.downloadDir)) {
      fs.mkdirSync(this.options.downloadDir, { recursive: true });
      this.logger.debug(
        `Dossier de téléchargement créé: ${this.options.downloadDir}`
      );
    }

    this.logger.debug(`Dossier de téléchargement: ${this.options.downloadDir}`);
    this.logger.debug(`Configuration: ${JSON.stringify(this.options)}`);
  }

  /**
   * Log messages based on log level
   */
  log(level: string, message: string) {
    switch (level) {
      case "debug":
        this.logger.debug(message);
        break;
      case "info":
        this.logger.info(message);
        break;
      case "warn":
        this.logger.warn(message);
        break;
      case "error":
        this.logger.error(message);
        break;
      default:
        this.logger.info(message);
    }
  }

  async downloadExtension(extensionId: string): Promise<string> {
    this.log("info", `Téléchargement de l'extension ${extensionId}...`);

    return new Promise((resolve, reject) => {
      if (!this.options.downloadDir) {
        reject(new Error("Le répertoire de téléchargement n'est pas défini."));
        return;
      }
      const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=89.0.4389.114&acceptformat=crx2,crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`;
      const crxFilePath = path.join(
        this.options.downloadDir,
        `${extensionId}.crx`
      );

      this.log("debug", `URL de téléchargement: ${crxUrl}`);
      this.log("debug", `Chemin du fichier crx: ${crxFilePath}`);

      if (!fs.existsSync(this.options.downloadDir)) {
        fs.mkdirSync(this.options.downloadDir, { recursive: true });
      }

      const file = fs.createWriteStream(crxFilePath);

      https
        .get(crxUrl, (response) => {
          this.log("debug", `Réponse HTTP: ${response.statusCode}`);
          if (response.statusCode === 302 || response.statusCode === 301) {
            this.log("debug", `Redirection vers: ${response.headers.location}`);
            https
              .get(response.headers.location as string, (redirectResponse) => {
                if (redirectResponse.statusCode !== 200) {
                  reject(
                    new Error(
                      `Échec du téléchargement de l'extension: HTTP status ${redirectResponse.statusCode}`
                    )
                  );
                  return;
                }

                redirectResponse.pipe(file);

                file.on("finish", () => {
                  file.close();
                  this.log("info", `Extension ${extensionId} téléchargée`);
                  resolve(crxFilePath);
                });
              })
              .on("error", (err) => {
                fs.unlink(crxFilePath, () => {});
                this.log(
                  "error",
                  `Erreur lors du téléchargement: ${err.message}`
                );
                reject(err);
              });
          } else if (response.statusCode === 200) {
            response.pipe(file);

            file.on("finish", () => {
              file.close();
              this.log("info", `Extension ${extensionId} téléchargée`);
              resolve(crxFilePath);
            });
          } else {
            this.log(
              "error",
              `Échec du téléchargement: HTTP status ${response.statusCode}`
            );
            reject(
              new Error(
                `Échec du téléchargement de l'extension: HTTP status ${response.statusCode}`
              )
            );
          }
        })
        .on("error", (err) => {
          fs.unlink(crxFilePath, () => {});
          this.log("error", `Erreur lors du téléchargement: ${err.message}`);
          reject(err);
        });
    });
  }

  async openOperaWithConfigUrl(
    profileName: string,
    configParams: { smartLinkUrl: string; secret: string }
  ): Promise<void> {
    try {
      const configUrl = `${configParams.smartLinkUrl}/#SmartLinkExtensionSecret=${configParams.secret}`;
      this.log("debug", `URL de configuration: ${configUrl}`);
      this.log("debug", `Ouverture avec le profil: ${profileName}`);

      await BrowserController.openWithUrl("opera", configUrl, profileName);

      this.log(
        "info",
        "Opera fermé après chargement de l'URL de configuration"
      );
    } catch (error) {
      this.log(
        "error",
        `Échec de l'ouverture d'Opera avec l'URL de configuration: ${error}`
      );
    }
  }

  getOperaPath(): string {
    const possiblePaths = [];

    if (process.platform === "darwin") {
      // macOS - plusieurs emplacements possibles
      possiblePaths.push(
        path.join(
          this.userHomeDir,
          "Library",
          "Application Support",
          "com.operasoftware.Opera"
        )
      );
      possiblePaths.push(
        path.join(this.userHomeDir, "Library", "Application Support", "Opera")
      );
      possiblePaths.push(
        path.join(
          this.userHomeDir,
          "Library",
          "Application Support",
          "Opera Software",
          "Opera"
        )
      );
      possiblePaths.push(
        path.join(
          this.userHomeDir,
          "Library",
          "Application Support",
          "Opera Software",
          "Opera Stable"
        )
      );
    } else if (process.platform === "win32") {
      // Windows - plusieurs emplacements possibles
      possiblePaths.push(
        path.join(
          this.userHomeDir,
          "AppData",
          "Roaming",
          "Opera Software",
          "Opera Stable"
        )
      );
      possiblePaths.push(
        path.join(
          this.userHomeDir,
          "AppData",
          "Local",
          "Opera Software",
          "Opera Stable"
        )
      );
      possiblePaths.push(
        path.join(this.userHomeDir, "AppData", "Roaming", "Opera", "Opera")
      );
    } else {
      // Linux - plusieurs emplacements possibles
      possiblePaths.push(path.join(this.userHomeDir, ".config", "opera"));
      possiblePaths.push(path.join(this.userHomeDir, ".opera"));
      possiblePaths.push(
        path.join(this.userHomeDir, ".config", "opera-stable")
      );
    }

    for (const potentialPath of possiblePaths) {
      this.log("debug", `Vérification du chemin Opera: ${potentialPath}`);
      if (fs.existsSync(potentialPath)) {
        this.log("debug", `Chemin Opera trouvé: ${potentialPath}`);
        return potentialPath;
      }
    }

    throw new Error(
      "Opera n'est pas installé ou le chemin est incorrect. Chemins vérifiés: " +
        possiblePaths.join(", ")
    );
  }

  getOperaProfiles(): string[] {
    const operaPath = this.getOperaPath();
    const profiles = [];

    // Vérifier le profil par défaut
    const defaultProfile = path.join(operaPath, "Default");
    if (fs.existsSync(defaultProfile)) {
      profiles.push(defaultProfile);
    }

    // Rechercher d'autres profils numérotés (comme Opera GX et versions récentes)
    try {
      const dirs = fs.readdirSync(operaPath);
      for (const dir of dirs) {
        if (dir.startsWith("Profile") || /^[0-9]+$/.test(dir)) {
          const profilePath = path.join(operaPath, dir);
          if (
            fs.statSync(profilePath).isDirectory() &&
            !profiles.includes(profilePath)
          ) {
            profiles.push(profilePath);
          }
        }
      }
    } catch (error) {
      this.log(
        "warn",
        `Erreur lors de la recherche de profils Opera: ${error}`
      );
    }

    if (profiles.length === 0) {
      throw new Error("Aucun profil Opera trouvé dans " + operaPath);
    }

    this.log("debug", `Profils Opera trouvés: ${profiles.join(", ")}`);
    return profiles;
  }

  getProfiles(): string[] {
    const profiles = this.getOperaProfiles();
    if (this.options.profiles && this.options.profiles.length > 0) {
      const operaPath = this.getOperaPath();
      const localStateFile = path.join(operaPath, "Local State");
      if (fs.existsSync(localStateFile)) {
        const localState = JSON.parse(fs.readFileSync(localStateFile, "utf8"));
        return profiles.filter((profile) => {
          const profileName =
            localState.profile.info_cache[path.basename(profile)]?.name;
          return this.options.profiles?.includes(profileName);
        });
      }
    }
    return profiles;
  }

  async installExtension(extensionId: string): Promise<void> {
    try {
      await BrowserController.close("opera");
      let profiles = this.getProfiles();

      this.log(
        "info",
        `Installation de l'extension ${extensionId} pour ${profiles.length} profils Opera...`
      );

      let crxFilePath;
      try {
        crxFilePath = await this.downloadExtension(extensionId);
        this.log("info", `Extension téléchargée: ${crxFilePath}`);
      } catch (error) {
        this.log(
          "error",
          `Erreur lors du téléchargement de l'extension: ${error}`
        );
        throw new Error(`Échec du téléchargement de l'extension: ${error}`);
      }

      let manifest;
      try {
        manifest = await extractManifestFromCrx(crxFilePath);
        this.log(
          "info",
          `Informations de l'extension récupérées: ${manifest.name} v${manifest.version}`
        );
      } catch (error) {
        this.log(
          "warn",
          `Impossible de récupérer les informations de l'extension: ${error}`
        );
      }

      for (const profile of profiles) {
        const preferenceFile = path.join(profile, "Preferences");
        const extensionsDir = path.join(profile, "Extensions", extensionId);

        if (!fs.existsSync(extensionsDir)) {
          fs.mkdirSync(extensionsDir, { recursive: true });
        }

        // Générer le nom du dossier de version au format Chrome/Opera (1.0.0 -> 1_0_0_0)
        const versionFormatted = manifest.version.replace(/\./g, "_") + "_0";
        const extensionVersionDir = path.join(extensionsDir, versionFormatted);

        this.log("debug", `Dossier de version formaté: ${versionFormatted}`);
        this.log(
          "debug",
          `Chemin complet du dossier de version: ${extensionVersionDir}`
        );

        if (fs.existsSync(extensionVersionDir) && this.options.forceReinstall) {
          this.log(
            "info",
            `Suppression du dossier de version existant: ${extensionVersionDir}`
          );
          fs.rmSync(extensionVersionDir, { recursive: true, force: true });
        } else if (
          fs.existsSync(extensionVersionDir) &&
          !this.options.forceReinstall
        ) {
          this.log(
            "info",
            `L'extension ${extensionId} est déjà installée. Utilisez l'option forceReinstall pour la réinstaller.`
          );
          continue;
        }

        // Créer le dossier de la version
        fs.mkdirSync(extensionVersionDir, { recursive: true });

        // Extraire le contenu du CRX dans le dossier de version
        try {
          // Même méthode que dans extractManifestFromCrx, mais cette fois pour extraire tout le contenu
          const crxData = fs.readFileSync(crxFilePath);

          let zipStartOffset = 0;
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

          if (!this.options.downloadDir) return;
          // Écrire les données ZIP dans un fichier temporaire
          const tempZipPath = path.join(
            this.options.downloadDir,
            "extension.zip"
          );
          fs.writeFileSync(tempZipPath, crxData.slice(zipStartOffset));

          // Utiliser une commande du système pour décompresser le ZIP directement dans le dossier de version
          if (process.platform === "win32") {
            // Windows
            execSync(
              `powershell -command "Expand-Archive -Path '${tempZipPath}' -DestinationPath '${extensionVersionDir}' -Force"`
            );
          } else {
            // Linux/Mac
            execSync(`unzip -o "${tempZipPath}" -d "${extensionVersionDir}"`);
          }

          this.log("info", `Extension extraite dans: ${extensionVersionDir}`);
        } catch (error) {
          this.log(
            "error",
            `Erreur lors de l'extraction de l'extension: ${error}`
          );
          fs.writeFileSync(
            path.join(extensionVersionDir, "manifest.json"),
            JSON.stringify(manifest, null, 2)
          );
        }

        if (fs.existsSync(preferenceFile)) {
          this.log(
            "debug",
            `Mise à jour des préférences dans: ${preferenceFile}`
          );
          const preferencesContent = fs.readFileSync(preferenceFile, "utf8");
          const preferences = JSON.parse(preferencesContent);

          if (!preferences.extensions) preferences.extensions = {};
          if (!preferences.extensions.opsettings)
            preferences.extensions.settings = {};

          preferences.extensions.opsettings[extensionId] = {
            account_extension_type: 0,
            active_permissions: {
              api: manifest.permissions || [
                "activeTab",
                "contextMenus",
                "storage",
                "scripting",
              ],
              explicit_host: manifest.host_permissions || [
                "file:///*",
                "http://localhost:3000/*",
                "https://*/*",
              ],
              manifest_permissions: [],
              scriptable_host: [],
            },
            commands: {},
            content_settings: [],
            creation_flags: 9,
            first_install_time: Date.now().toString(),
            from_webstore: true,
            granted_permissions: {
              api: manifest.permissions || [
                "activeTab",
                "contextMenus",
                "storage",
                "tabs",
                "scripting",
              ],
              explicit_host: manifest.host_permissions || [
                "*://*/*",
                "file:///*",
                "http://localhost:3000/*",
                "https://*/*",
              ],
              manifest_permissions: [],
              scriptable_host: [],
            },
            incognito_content_settings: [],
            incognito_preferences: {},
            installation_time: Math.floor(Date.now() / 1000),
            last_update_time: Date.now().toString(),
            location: 1,
            path: `${extensionId}/${versionFormatted}`,
            preferences: {},
            regular_only_preferences: {},
            serviceworkerevents: [
              "contextMenus.onClicked",
              "runtime.onInstalled",
              "tabs.onHighlighted",
              "tabs.onRemoved",
              "tabs.onUpdated",
            ],
            state: 1,
            was_installed_by_default: false,
            was_installed_by_oem: false,
            withholding_permissions: false,
            manifest: manifest,
          };

          if (!preferences.extensions.external_extensions) {
            preferences.extensions.external_extensions = {};
          }
          preferences.extensions.external_extensions[extensionId] = {
            external_update_url:
              "https://clients2.google.com/service/update2/crx",
            install_time: Math.floor(Date.now() / 1000),
            location: 1,
          };

          // Ajouter l'extension à la liste des extensions connues activées
          if (!preferences.extensions.known_enabled) {
            preferences.extensions.known_enabled = [];
          }
          if (!preferences.extensions.known_enabled.includes(extensionId)) {
            preferences.extensions.known_enabled.push(extensionId);
          }

          // Ajouter l'extension à la liste des extensions épinglées
          if (this.options.pinExtension) {
            if (!preferences.extensions.pinned_extensions) {
              preferences.extensions.pinned_extensions = [];
            }
            if (
              !preferences.extensions.pinned_extensions.includes(extensionId)
            ) {
              preferences.extensions.pinned_extensions.push(extensionId);
            }
          }

          // Écrire les modifications dans le fichier
          fs.writeFileSync(
            preferenceFile,
            JSON.stringify(preferences, null, 2)
          );
          this.log("info", `Extension installée pour le profil: ${profile}`);

          // Ouvrir Opera avec l'URL de configuration si les paramètres sont fournis
          if (
            this.options.config?.smartLinkUrl &&
            this.options.config?.secret
          ) {
            this.log(
              "info",
              `Ouverture d'Opera avec l'URL de configuration pour le profil: ${path.basename(
                profile
              )}`
            );

            await this.openOperaWithConfigUrl(path.basename(profile), {
              smartLinkUrl: this.options.config.smartLinkUrl,
              secret: this.options.config.secret,
            });
          }
        }
      }

      // Nettoyer les fichiers temporaires
      this.log(
        "info",
        `Nettoyage du dossier de téléchargement: ${this.options.downloadDir}`
      );
      if (this.options.downloadDir && fs.existsSync(this.options.downloadDir)) {
        fs.rmSync(this.options.downloadDir, { recursive: true, force: true });
      }

      this.log(
        "info",
        "Installation terminée. Veuillez redémarrer Opera pour activer l'extension."
      );
    } catch (error) {
      this.log("error", `Erreur dans Opera.installExtension: ${error}`);
      throw error; // Remonter l'erreur pour qu'elle soit gérée plus haut
    }
  }

  // Méthode statique pour la rétrocompatibilité
  static async installExtension(
    userHomeDir: string,
    extensionId: string,
    configObject: { smartLinkUrl: string; secret: string },
    pin: boolean = false
  ): Promise<void> {
    const installer = new Opera({
      forceReinstall: true,
      pinExtension: pin,
      config: configObject,
    });

    await installer.installExtension(extensionId);
  }
}
