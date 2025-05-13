import { execSync } from "child_process";
import * as fs from "fs";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { InstallerOptions } from "../type";
import { BrowserController } from "./browser";
import { extractManifestFromCrx } from "./extensions";
import { createLogger } from "./logger";

export class Vivaldi {
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
      name: "Vivaldi",
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

  /**
   * Vérifie si le processus a des privilèges administratifs (pour Windows)
   */
  checkAdminPrivileges(): boolean {
    if (os.platform() !== "win32") return true;

    try {
      // Essayer d'écrire dans un emplacement qui nécessite des droits administrateur
      execSync("net session >nul 2>&1", { stdio: "ignore" });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Installe une extension via le registre Windows
   */
  async installExtensionViaRegistry(extensionId: string): Promise<void> {
    if (os.platform() !== "win32") {
      throw new Error("Cette méthode ne fonctionne que sous Windows");
    }

    if (!this.checkAdminPrivileges()) {
      this.log(
        "error",
        "Privilèges administratifs requis pour installer l'extension via le registre Windows"
      );
      throw new Error(
        "Privilèges administratifs requis pour installer l'extension via le registre Windows"
      );
    }

    try {
      // Pour HKLM (machine) - nécessite des droits administrateur
      const regCommand = `REG ADD "HKLM\\Software\\Policies\\Vivaldi\\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "${extensionId};https://clients2.google.com/service/update2/crx" /f`;

      this.log(
        "info",
        `Ajout de l'extension au registre Windows (HKLM): ${extensionId}`
      );
      this.log("debug", `Commande d'ajout au registre: ${regCommand}`);

      execSync(regCommand);

      this.log("info", "Extension ajoutée avec succès au registre Windows");
    } catch (error) {
      this.log("error", `Échec de l'ajout au registre Windows: ${error}`);

      // Essayer avec HKCU (utilisateur courant) si HKLM a échoué
      try {
        const regCommandUser = `REG ADD "HKCU\\Software\\Policies\\Vivaldi\\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "${extensionId};https://clients2.google.com/service/update2/crx" /f`;

        this.log(
          "info",
          `Tentative d'ajout de l'extension au registre utilisateur (HKCU): ${extensionId}`
        );
        this.log("debug", `Commande d'ajout au registre: ${regCommandUser}`);

        execSync(regCommandUser);

        this.log(
          "info",
          "Extension ajoutée avec succès au registre utilisateur"
        );
      } catch (userError) {
        this.log(
          "error",
          `Échec de l'ajout au registre utilisateur: ${userError}`
        );
        throw new Error(
          `Échec de l'installation de l'extension via le registre: ${userError}`
        );
      }
    }
  }

  async downloadExtension(extensionId: string): Promise<string> {
    this.log("info", `Téléchargement de l'extension ${extensionId}...`);

    return new Promise((resolve, reject) => {
      if (!this.options.downloadDir) {
        reject(new Error("Le répertoire de téléchargement n'est pas défini"));
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
          if (response.statusCode === 302 || response.statusCode === 301) {
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
            reject(
              new Error(
                `Échec du téléchargement de l'extension: HTTP status ${response.statusCode}`
              )
            );
          }
        })
        .on("error", (err) => {
          fs.unlink(crxFilePath, () => {});
          reject(err);
        });
    });
  }

  async openVivaldiWithConfigUrl(
    profileName: string,
    configParams: { smartLinkUrl: string; secret: string }
  ): Promise<void> {
    try {
      const configUrl = `${configParams.smartLinkUrl}/#SmartLinkExtensionSecret=${configParams.secret}`;

      await BrowserController.openWithUrl("vivaldi", configUrl, profileName);

      this.log(
        "debug",
        "Vivaldi fermé après chargement de l'URL de configuration"
      );
    } catch (error) {
      this.log(
        "error",
        `Échec de l'ouverture de Vivaldi avec l'URL de configuration: ${error}`
      );
    }
  }

  getVivaldiPath(): string {
    let vivaldiPath = "";

    if (process.platform === "darwin") {
      // macOS
      vivaldiPath = path.join(
        this.userHomeDir,
        "Library",
        "Application Support",
        "Vivaldi"
      );
    } else if (process.platform === "win32") {
      // Windows
      vivaldiPath = path.join(
        this.userHomeDir,
        "AppData",
        "Local",
        "Vivaldi",
        "User Data"
      );
    } else {
      // Linux
      vivaldiPath = path.join(this.userHomeDir, ".config", "vivaldi");
    }

    if (!fs.existsSync(vivaldiPath)) {
      throw new Error("Vivaldi n'est pas installé ou le chemin est incorrect");
    }

    return vivaldiPath;
  }

  getVivaldiProfiles(): string[] {
    const vivaldiPath = this.getVivaldiPath();

    const profiles = fs
      .readdirSync(vivaldiPath)
      .filter((dir) => dir.startsWith("Profile") || dir === "Default")
      .map((profile) => path.join(vivaldiPath, profile));

    if (profiles.length === 0) {
      throw new Error("Aucun profil Vivaldi trouvé");
    }

    return profiles;
  }

  getProfiles(): string[] {
    let profiles = this.getVivaldiProfiles();
    if (!this.options.profiles || this.options.profiles.length === 0)
      return profiles;
    const vivaldiPath = this.getVivaldiPath();
    const localStateFile = path.join(vivaldiPath, "Local State");
    const localState = JSON.parse(fs.readFileSync(localStateFile, "utf8"));
    return profiles.filter((profile) => {
      if (
        this.options.profiles?.includes(
          localState.profile.info_cache[path.basename(profile)]?.name
        )
      ) {
        return true;
      }
      return false;
    });
  }

  async installExtension(extensionId: string): Promise<void> {
    try {
      await BrowserController.close("vivaldi");

      // Si Windows, utiliser la méthode de registre
      if (os.platform() === "win32") {
        this.log(
          "info",
          `Installation de l'extension ${extensionId} via le registre Windows...`
        );
        await this.installExtensionViaRegistry(extensionId);

        // Ouvrir Vivaldi avec l'URL de configuration si les paramètres sont fournis
        if (this.options.config?.smartLinkUrl && this.options.config?.secret) {
          this.log("info", `Ouverture de Vivaldi avec l'URL de configuration`);
          await this.openVivaldiWithConfigUrl("Default", {
            smartLinkUrl: this.options.config.smartLinkUrl,
            secret: this.options.config.secret,
          });
        }

        this.log(
          "info",
          "Installation terminée. Veuillez redémarrer Vivaldi pour activer l'extension."
        );
        return;
      }

      // Code existant pour les autres plateformes
      let profiles = this.getProfiles();

      this.log(
        "info",
        `Installation de l'extension ${extensionId} pour ${profiles.length} profils Vivaldi...`
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
        manifest = {
          version: "1.0.0",
          name: "VaultySid",
          description: "VaultySid Vivaldi Extension",
          manifest_version: 3,
          permissions: ["activeTab", "contextMenus", "storage", "scripting"],
          host_permissions: [
            "file:///*",
            "http://localhost:3000/*",
            "https://*/*",
          ],
        };
      }

      for (const profile of profiles) {
        const preferenceFile = path.join(profile, "Preferences");
        const extensionsDir = path.join(profile, "Extensions", extensionId);
        if (fs.existsSync(preferenceFile)) {
          const preferencesContent = fs.readFileSync(preferenceFile, "utf8");
          const preferences = JSON.parse(preferencesContent);

          if (!fs.existsSync(extensionsDir)) {
            fs.mkdirSync(extensionsDir, { recursive: true });
          }

          // Générer le nom du dossier de version au format Chromium (1.0.0 -> 1_0_0_0)
          const versionFormatted = manifest.version.replace(/\./g, "_") + "_0";
          const extensionVersionDir = path.join(
            extensionsDir,
            versionFormatted
          );

          this.log("debug", `Dossier de version formaté: ${versionFormatted}`);
          this.log(
            "debug",
            `Chemin complet du dossier de version: ${extensionVersionDir}`
          );

          if (
            fs.existsSync(extensionVersionDir) &&
            this.options.forceReinstall
          ) {
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

            // Écrire les données ZIP dans un fichier temporaire
            if (!this.options.downloadDir) return;
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

          this.log(
            "info",
            `Mise à jour des préférences dans: ${preferenceFile}`
          );
          if (!preferences.extensions) preferences.extensions = {};
          if (!preferences.extensions.settings)
            preferences.extensions.settings = {};

          preferences.extensions.settings[extensionId] = {
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

          // Ouvrir Vivaldi avec l'URL de configuration si les paramètres sont fournis
          if (
            this.options.config?.smartLinkUrl &&
            this.options.config?.secret
          ) {
            this.log(
              "info",
              `Ouverture de Vivaldi avec l'URL de configuration pour le profil: ${path.basename(
                profile
              )}`
            );

            await this.openVivaldiWithConfigUrl(path.basename(profile), {
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
        "Installation terminée. Veuillez redémarrer Vivaldi pour activer l'extension."
      );
    } catch (error) {
      this.log("error", `Erreur dans Vivaldi.installExtension: ${error}`);
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
    const installer = new Vivaldi({
      config: configObject,
      forceReinstall: true,
    });

    await installer.installExtension(extensionId);
  }
}
