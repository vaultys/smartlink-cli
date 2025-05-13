import AdmZip from "adm-zip";
import { exec } from "child_process";
import { createHash } from "crypto";
import fs, {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlink,
  unlinkSync,
  writeFileSync,
} from "fs";
import { get } from "https";
import { homedir, tmpdir } from "os";
import { dirname, join } from "path";
import { promisify } from "util";
import { InstallerOptions } from "../type";
import { BrowserController } from "./browser";
import { createLogger } from "./logger";
const execAsync = promisify(exec);

/**
 * Firefox Extension Installer
 * Installs extensions directly to the file system from a list of extension IDs or URLs
 */
export class FirefoxExtensionInstaller {
  options: InstallerOptions;
  profileDir: string;
  extensionsDir: string;
  private logger: ReturnType<typeof createLogger>;

  constructor(options: InstallerOptions = {}) {
    this.options = {
      profiles: options.profiles ?? undefined,

      // Custom Firefox user data directory (if null, default location is used)
      installDir: options.installDir ?? undefined,

      // Where to download the XPI files temporarily
      downloadDir: options.downloadDir ?? join(tmpdir(), "firefox-extensions"),

      // Force reinstall even if extension exists
      forceReinstall: options.forceReinstall ?? false,

      // Log level: 'debug', 'info', 'warn', 'error'
      logLevel: options.logLevel ?? "info",
      config: options.config,
    };

    this.logger = createLogger({
      logLevel: this.options.logLevel,
      name: "Firefox",
    });

    this.options.installDir ??= this.getDefaultFirefoxProfilesDir();

    // Create download directory if it doesn't exist
    if (this.options.downloadDir && !existsSync(this.options.downloadDir)) {
      mkdirSync(this.options.downloadDir, { recursive: true });
      this.logger.debug(
        `Dossier de téléchargement créé: ${this.options.downloadDir}`
      );
    }

    // Find the correct profile folder
    this.profileDir = this.findProfileDirectory();
    if (!this.profileDir) {
      throw new Error("Could not determine Firefox profile directory");
    }

    this.extensionsDir = join(this.profileDir, "extensions");

    // Create extensions directory if it doesn't exist
    if (!existsSync(this.extensionsDir)) {
      mkdirSync(this.extensionsDir, { recursive: true });
      this.logger.debug(`Dossier d'extensions créé: ${this.extensionsDir}`);
    }

    this.logger.debug(`Dossier d'extensions: ${this.extensionsDir}`);
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
   * Get the default Firefox profiles directory based on the OS
   */
  getDefaultFirefoxProfilesDir() {
    const platform = process.platform;
    const homeDir = homedir();

    if (platform === "win32") {
      return join(
        homeDir,
        "AppData",
        "Roaming",
        "Mozilla",
        "Firefox",
        "Profiles"
      );
    } else if (platform === "darwin") {
      return join(
        homeDir,
        "Library",
        "Application Support",
        "Firefox",
        "Profiles"
      );
    } else if (platform === "linux") {
      const possiblePaths = [
        join(homeDir, ".mozilla", "firefox"), // Installation standard
        join(homeDir, "snap", "firefox", "common", ".mozilla", "firefox"), // Installation via Snap
        join(
          homeDir,
          ".var",
          "app",
          "org.mozilla.firefox",
          "data",
          "mozilla",
          "firefox"
        ), // Flatpak
      ];

      for (const path of possiblePaths) {
        if (existsSync(path)) {
          this.log("info", `Found Firefox profiles directory at: ${path}`);
          return path;
        }
      }

      this.log(
        "warn",
        "Could not find Firefox profiles directory, using default path"
      );
      return join(homeDir, ".mozilla", "firefox");
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get list of Firefox profiles
   */
  getFirefoxProfiles() {
    try {
      // Path to the profiles.ini file
      const profilesIniPath = join(
        this.getDefaultFirefoxProfilesDir(),
        "profiles.ini"
      );

      if (!existsSync(profilesIniPath)) {
        this.log(
          "error",
          `Firefox profiles.ini not found at ${profilesIniPath}`
        );

        // Try alternative locations on Windows
        if (process.platform === "win32") {
          const altLocations = [
            join(
              homedir(),
              "AppData",
              "Roaming",
              "Mozilla",
              "Firefox",
              "profiles.ini"
            ),
            join(
              homedir(),
              "AppData",
              "Local",
              "Mozilla",
              "Firefox",
              "profiles.ini"
            ),
          ];

          for (const altPath of altLocations) {
            if (existsSync(altPath)) {
              this.log(
                "info",
                `Found profiles.ini at alternative location: ${altPath}`
              );
              const profilesIni = readFileSync(altPath, "utf8");
              return this.parseProfilesIni(profilesIni, dirname(altPath));
            }
          }
        }

        return [];
      }

      const profilesIni = readFileSync(profilesIniPath, "utf8");
      this.log("info", `Reading profiles.ini from ${profilesIniPath}`);
      return this.parseProfilesIni(profilesIni, dirname(profilesIniPath));
    } catch (error) {
      this.log("error", `Error parsing Firefox profiles: ${error}`);
      return [];
    }
  }

  /**
   * Parse profiles.ini content
   */
  private parseProfilesIni(profilesIni: string, basePath: string) {
    const profiles: any[] = [];
    let currentProfile: any = null;

    // Parse profiles.ini file
    profilesIni.split("\n").forEach((line) => {
      line = line.trim();

      if (line.startsWith("[Profile")) {
        if (currentProfile) {
          profiles.push(currentProfile);
        }
        currentProfile = { name: "", path: "", default: false };
      } else if (currentProfile) {
        if (line.startsWith("Name=")) {
          currentProfile.name = line.substring(5);
        } else if (line.startsWith("Path=")) {
          const relativePath = line.substring(5);
          // Handle both relative and absolute paths
          if (relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath)) {
            currentProfile.path = relativePath;
          } else {
            currentProfile.path = join(basePath, relativePath);
          }
          this.log("debug", `Found profile path: ${currentProfile.path}`);
        } else if (line === "Default=1") {
          currentProfile.default = true;
        } else if (line.startsWith("IsRelative=")) {
          currentProfile.isRelative = line.substring(11) === "1";
        }
      }
    });

    if (currentProfile) {
      profiles.push(currentProfile);
    }

    this.log("info", `Found ${profiles.length} Firefox profiles`);
    return profiles;
  }

  /**
   * Find the Firefox profile directory to use
   */
  findProfileDirectory() {
    try {
      const profiles = this.getFirefoxProfiles();

      if (profiles.length === 0) {
        // Fallback mechanism for Windows when profiles can't be found
        if (process.platform === "win32") {
          const defaultProfilePath = join(
            this.options.installDir ?? "",
            "Profiles"
          );
          if (existsSync(defaultProfilePath)) {
            // Try to find any profile folder
            const entries = fs.readdirSync(defaultProfilePath);
            for (const entry of entries) {
              const profilePath = join(defaultProfilePath, entry);
              if (fs.statSync(profilePath).isDirectory()) {
                this.log("info", `Using fallback profile at: ${profilePath}`);
                return profilePath;
              }
            }
          }
        }

        throw new Error("No Firefox profile found");
      }

      const defaultProfile = profiles.find((p) => p.default) ?? profiles[0];
      if (defaultProfile) {
        this.log(
          "info",
          `Using profile: ${defaultProfile.name} at ${defaultProfile.path}`
        );
        return defaultProfile.path;
      }

      throw new Error("No Firefox profile found");
    } catch (error) {
      this.log("error", `Error finding Firefox profile: ${error}`);
      throw error;
    }
  }

  /**
   * Check if Firefox is running
   */
  async isFirefoxRunning() {
    try {
      let command: string;

      if (process.platform === "win32") {
        command = "tasklist | findstr firefox";
      } else if (process.platform === "darwin") {
        command = 'pgrep -x "firefox" || pgrep -x "Firefox"';
      } else {
        command = "pgrep -x firefox";
      }

      const { stdout } = await execAsync(command);
      return stdout.trim().length > 0;
    } catch (error) {
      // Process not found
      return false;
    }
  }

  /**
   * Download extension XPI file from URL or Mozilla add-ons
   */
  async downloadExtension(extensionId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let url: string;

      // Check if extensionId is a URL
      if (
        extensionId.startsWith("http://") ||
        extensionId.startsWith("https://")
      ) {
        url = extensionId;
      } else {
        // Assume it's an AMO ID and construct the URL
        url = `https://addons.mozilla.org/firefox/downloads/latest/${extensionId}/addon-${extensionId}-latest.xpi`;
      }

      if (!this.options.downloadDir)
        return reject(new Error("Download directory not specified"));
      const xpiFilePath = join(
        this.options.downloadDir,
        `${this.getExtensionFilename(extensionId)}.xpi`
      );

      this.log("debug", `Downloading from: ${url}`);

      const file = createWriteStream(xpiFilePath);

      get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirects
          this.log("debug", `Redirecting to: ${response.headers.location}`);
          get(response.headers.location ?? "", (redirectResponse) => {
            if (redirectResponse.statusCode !== 200) {
              reject(
                new Error(
                  `Failed to download extension: HTTP status ${redirectResponse.statusCode}`
                )
              );
              return;
            }

            redirectResponse.pipe(file);

            file.on("finish", () => {
              file.close();
              this.log("info", `Downloaded extension ${extensionId}`);
              resolve(xpiFilePath);
            });
          }).on("error", (err) => {
            unlink(xpiFilePath, () => {}); // Delete failed download
            reject(err);
          });
        } else if (response.statusCode === 200) {
          // Direct download
          response.pipe(file);

          file.on("finish", () => {
            file.close();
            this.log("info", `Downloaded extension ${extensionId}`);
            resolve(xpiFilePath);
          });
        } else {
          reject(
            new Error(
              `Failed to download extension: HTTP status ${response.statusCode}`
            )
          );
        }
      }).on("error", (err) => {
        unlink(xpiFilePath, () => {}); // Delete failed download
        reject(err);
      });
    });
  }

  /**
   * Get a safe filename from extension ID or URL
   */
  getExtensionFilename(extensionId: string) {
    // If it's a URL, extract the filename or use a hash
    if (extensionId.startsWith("http")) {
      const urlParts = extensionId.split("/");
      const lastPart = urlParts[urlParts.length - 1];
      if (lastPart && !lastPart.includes("?")) {
        return lastPart.replace(/\.xpi$/, "");
      } else {
        // Create a hash of the URL
        return createHash("md5").update(extensionId).digest("hex");
      }
    }
    return extensionId;
  }

  /**
   * Open Firefox with a specific profile and configuration URL
   */
  async openFirefoxWithConfigUrl(
    profileName: string,
    configParams?: { smartLinkUrl?: string; secret?: string }
  ) {
    try {
      if (!configParams) return;
      const configUrl = `${configParams.smartLinkUrl}/#SmartLinkExtensionSecret=${configParams.secret}`;

      await BrowserController.openWithUrl("firefox", configUrl, profileName);

      this.log("info", "Firefox closed after loading configuration URL");
      return true;
    } catch (error) {
      this.log("error", `Failed to open Firefox with config URL: ${error}`);
      return false;
    }
  }

  /**
   * Install an extension to the Firefox profile and update extensions.json
   */
  async installXpi(xpiFilePath: string) {
    try {
      // Extract the extension ID from the XPI file
      const zip = new AdmZip(xpiFilePath);
      const manifestEntry = zip.getEntry("manifest.json");

      if (!manifestEntry) {
        throw new Error("Invalid extension: manifest.json not found");
      }

      const manifestContent = zip.readAsText(manifestEntry);
      const manifest = JSON.parse(manifestContent);

      // Get the extension ID from the manifest
      let extensionId =
        manifest.browser_specific_settings?.gecko?.id ||
        manifest.applications?.gecko?.id;

      if (!extensionId) {
        this.log(
          "warn",
          "Extension ID not found in manifest, generating a random ID"
        );
        extensionId = `random-${createHash("md5")
          .update(Date.now().toString())
          .digest("hex")}@temporary.addon`;
      }

      const zipBuffer = zip.toBuffer();
      const extensionName = manifest.name ?? "Unknown Extension";
      const extensionVersion = manifest.version ?? "0.0.0";
      const extensionDescription = manifest.description ?? "";

      // Get the file stats for install time
      const fileStats = statSync(xpiFilePath);
      const installDate = new Date(fileStats.mtime).getTime();

      // Install the extension to each profile
      for (const profile of this.getFirefoxProfiles().filter(
        (profile) =>
          !this.options.profiles || this.options.profiles.includes(profile.name)
      )) {
        const extensionsDir = join(profile.path, "extensions");

        // Create extensions directory if it doesn't exist
        if (!existsSync(extensionsDir)) {
          mkdirSync(extensionsDir, { recursive: true });
        }

        const targetPath = join(extensionsDir, `${extensionId}.xpi`);
        writeFileSync(targetPath, zipBuffer);
        this.log("info", `Installed extension ${extensionId} to ${targetPath}`);

        // Update extensions.json
        await this.updateExtensionsJson(profile.path, {
          id: extensionId,
          name: extensionName,
          description: extensionDescription,
          version: extensionVersion,
          path: targetPath,
          installDate: installDate,
        });

        // Open Firefox with configuration URL after installing the extension
        await this.openFirefoxWithConfigUrl(profile.name, this.options.config);
      }

      return extensionId;
    } catch (error) {
      this.log("error", `Failed to install extension: ${error}`);
      throw error;
    }
  }

  /**
   * Update the extensions.json file with the new extension information
   */
  private async updateExtensionsJson(
    profilePath: string,
    extensionInfo: {
      id: string;
      name: string;
      description: string;
      version: string;
      path: string;
      installDate: number;
    }
  ) {
    try {
      const extensionsJsonPath = join(profilePath, "extensions.json");
      let extensionsData: any = { addons: [] };

      // Read existing extensions.json if it exists
      if (existsSync(extensionsJsonPath)) {
        try {
          const content = readFileSync(extensionsJsonPath, "utf8");
          extensionsData = JSON.parse(content);
        } catch (error) {
          this.log(
            "warn",
            `Could not parse extensions.json, creating a new one: ${error}`
          );
        }
      }

      // Remove any existing entry for this extension
      if (extensionsData.addons) {
        extensionsData.addons = extensionsData.addons.filter(
          (addon: any) => addon.id !== extensionInfo.id
        );
      } else {
        extensionsData.addons = [];
      }

      // Create entry for the new extension
      const newExtension = {
        id: extensionInfo.id,
        syncGUID: createHash("md5")
          .update(`${extensionInfo.id}-${Date.now()}`)
          .digest("hex"),
        location: "app-profile",
        version: extensionInfo.version,
        type: "extension",
        internalName: null,
        updateURL: null,
        updateKey: null,
        optionsURL: null,
        optionsType: null,
        aboutURL: null,
        defaultLocale: {
          name: extensionInfo.name,
          description: extensionInfo.description,
          creator: null,
          homepageURL: null,
        },
        visible: true,
        active: true,
        userDisabled: false,
        appDisabled: false,
        embedderDisabled: false,
        installDate: extensionInfo.installDate,
        updateDate: extensionInfo.installDate,
        applyBackgroundUpdates: 1,
        path: extensionInfo.path,
        skinnable: false,
        sourceURI: null,
        releaseNotesURI: null,
        softDisabled: false,
        foreignInstall: false,
        strictCompatibility: false,
        locales: [],
        targetApplications: [
          {
            id: "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}", // Firefox
            minVersion: "42.0",
            maxVersion: "*",
          },
        ],
        targetPlatforms: [],
        multiprocessCompatible: true,
        signedState: 0,
        seen: true,
        dependencies: [],
        incognito: "spanning",
        userPermissions: null,
        icons: {},
        iconURL: null,
        blocklistState: 0,
        blocklistURL: null,
        startupData: null,
        hidden: false,
        installTelemetryInfo: {
          source: "file",
          sourceURL: null,
          method: "install",
        },
        recommendationState: null,
        rootURI: `jar:file://${extensionInfo.path}!/`,
        temporarilyInstalled: false,
      };

      // Add the new extension to the addons array
      extensionsData.addons.push(newExtension);

      // Write back the updated extensions.json
      writeFileSync(
        extensionsJsonPath,
        JSON.stringify(extensionsData, null, 2)
      );
      this.log("info", `Updated extensions.json for ${extensionInfo.id}`);
    } catch (error) {
      this.log("error", `Failed to update extensions.json: ${error}`);
      // Continue despite error - Firefox can still operate if the update fails
    }
  }

  /**
   * Check if an extension is already installed
   */
  isExtensionInstalled(extensionId: string) {
    const extensionPath = join(this.extensionsDir, `${extensionId}.xpi`);
    return existsSync(extensionPath);
  }

  /**
   * Install a single extension
   */
  async installExtension(extensionIdOrUrl: string) {
    try {
      this.log("info", `Installing extension: ${extensionIdOrUrl}`);

      // Extract extension ID if it's a URL with a standard XPI filename pattern
      let extensionId = extensionIdOrUrl;
      if (extensionIdOrUrl.includes("/")) {
        const urlParts = extensionIdOrUrl.split("/");
        const lastPart = urlParts[urlParts.length - 1];
        if (lastPart.includes("@") && lastPart.endsWith(".xpi")) {
          extensionId = lastPart.replace(".xpi", "");
        }
      }

      // Check if already installed and not forcing reinstall
      if (
        this.isExtensionInstalled(extensionId) &&
        !this.options.forceReinstall
      ) {
        this.log(
          "info",
          `Extension ${extensionId} is already installed. Use forceReinstall option to reinstall.`
        );
        return true;
      }

      // Close Firefox if it's running and the option is enabled
      if (this.options.config) {
        const running = await this.isFirefoxRunning();
        if (running) {
          this.log(
            "info",
            "Firefox is running. Closing Firefox before installation..."
          );
          await BrowserController.close("firefox");
          // Give Firefox time to fully close
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      // Download the extension
      const xpiFilePath = await this.downloadExtension(extensionIdOrUrl);

      // Install the XPI
      await this.installXpi(xpiFilePath);

      // Cleanup downloaded XPI if not keeping downloads
      if (existsSync(xpiFilePath)) {
        unlinkSync(xpiFilePath);
      }

      return true;
    } catch (error) {
      this.log(
        "error",
        `Failed to install extension ${extensionIdOrUrl}: ${error}`
      );
      return false;
    }
  }

  /**
   * Install multiple extensions
   */
  async installExtensions(extensionIds: string[]) {
    const results: any = {};

    for (const extensionId of extensionIds) {
      results[extensionId] = await this.installExtension(extensionId);
    }

    // Print summary
    this.log("info", "\n==== Installation Summary ====");
    let successCount = 0;
    let failCount = 0;

    for (const [id, success] of Object.entries(results)) {
      const status = success ? "✓ Success" : "✗ Failed";
      this.log("info", `${id}: ${status}`);

      if (success) successCount++;
      else failCount++;
    }

    this.log(
      "info",
      `\nTotal: ${extensionIds.length}, Successful: ${successCount}, Failed: ${failCount}`
    );

    return results;
  }

  /**
   * Clean up temporary files
   */
  cleanup() {
    if (this.options.downloadDir && existsSync(this.options.downloadDir)) {
      this.log(
        "debug",
        `Cleaning up download directory: ${this.options.downloadDir}`
      );
      try {
        rmSync(this.options.downloadDir, { recursive: true, force: true });
      } catch (error) {
        this.log("warn", `Failed to clean up download directory: ${error}`);
      }
    }
  }
}
