import { ArgumentsCamelCase } from "yargs";
import { Chrome } from "./utils/chrome";
import { Edge } from "./utils/edge";
import { Opera } from "./utils/opera";
import { Brave } from "./utils/brave";
import { FirefoxExtensionInstaller } from "./utils/firefox";
import { InstallerOptions } from "./type";
import { createLogger } from "./utils/logger";
import { Vivaldi } from "./utils/vivaldi";

export async function installExtensionCommand(
  argv: ArgumentsCamelCase<{
    smartLinkUrl?: string;
    secret?: string;
    browser?: string;
    profiles?: string[];
    installDir?: string;
    downloadDir?: string;
    forceReinstall?: boolean;
    logLevel?: string;
    pinExtension?: boolean;
  }>
): Promise<void> {
  const logger = createLogger({
    logLevel: argv.logLevel || "info",
    name: "InstallExtension",
  });

  try {
    logger.debug(`Arguments de la commande: ${JSON.stringify(argv)}`);
    // S'assurer que browser a une valeur par défaut
    const browser = argv.browser || "chrome";

    // Préparer les options d'installation communes
    const installerOptions: InstallerOptions = {
      profiles: argv.profiles,
      installDir: argv.installDir,
      downloadDir: argv.downloadDir,
      forceReinstall: argv.forceReinstall !== undefined ? argv.forceReinstall : true,
      logLevel: argv.logLevel || "info",
      pinExtension: argv.pinExtension,
      config: {
        smartLinkUrl: argv.smartLinkUrl,
        secret: argv.secret,
      },
    };

    logger.info(`Début du processus d'installation pour ${browser.toLowerCase()}`);
    logger.debug(`Options d'installation: ${JSON.stringify(installerOptions)}`);

    if (browser.toLowerCase() === "chrome") {
      logger.info("Installation pour Chrome - Initialisation");
      const chromeExtensionId = "hfkipjpbjnpdpaofpilegpmbbfhmoceb";
      logger.info(`Installation de l'extension pour Chrome avec ID ${chromeExtensionId}...`);
      try {
        const chromeInstaller = new Chrome(installerOptions);
        logger.debug("Instance Chrome créée, début de l'installation");
        await chromeInstaller.installExtension(chromeExtensionId);
        logger.info("Installation de l'extension Chrome terminée avec succès");
      } catch (chromeError) {
        logger.error(`Erreur spécifique à Chrome: ${chromeError}`);
        throw chromeError;
      }
    } else if (browser.toLowerCase() === "edge") {
      logger.info("Installation pour Edge - Initialisation");
      const edgeExtensionId = "hfkipjpbjnpdpaofpilegpmbbfhmoceb";
      logger.info(`Installation de l'extension pour Edge avec ID ${edgeExtensionId}...`);

      try {
        const edgeInstaller = new Edge(installerOptions);
        logger.debug("Instance Edge créée, début de l'installation");
        await edgeInstaller.installExtension(edgeExtensionId);
        logger.info("Installation de l'extension Edge terminée avec succès");
      } catch (edgeError) {
        logger.error(`Erreur spécifique à Edge: ${edgeError}`);
        throw edgeError;
      }
    } else if (browser.toLowerCase() === "brave") {
      logger.info("Installation pour Brave - Initialisation");
      const braveExtensionId = "hfkipjpbjnpdpaofpilegpmbbfhmoceb";
      logger.info(`Installation de l'extension pour Brave avec ID ${braveExtensionId}...`);

      try {
        const braveInstaller = new Brave(installerOptions);
        logger.debug("Instance Brave créée, début de l'installation");
        await braveInstaller.installExtension(braveExtensionId);
        logger.info("Installation de l'extension Brave terminée avec succès");
      } catch (braveError) {
        logger.error(`Erreur spécifique à Brave: ${braveError}`);
        throw braveError;
      }
    } else if (browser.toLowerCase() === "opera") {
      logger.info("Installation pour Opera - Initialisation");
      const operaExtensionId = "hfkipjpbjnpdpaofpilegpmbbfhmoceb";
      logger.info(`Installation de l'extension pour Opera avec ID ${operaExtensionId}...`);

      try {
        const operaInstaller = new Opera(installerOptions);
        logger.debug("Instance Opera créée, début de l'installation");
        await operaInstaller.installExtension(operaExtensionId);
        logger.info("Installation de l'extension Opera terminée avec succès");
      } catch (operaError) {
        logger.error(`Erreur spécifique à Opera: ${operaError}`);
        throw operaError;
      }
    } else if (browser.toLowerCase() === "firefox") {
      logger.info("Installation pour Firefox - Initialisation");
      const firefoxExtensionName = "smartlink-extension";
      logger.info(`Installation de l'extension pour Firefox avec nom ${firefoxExtensionName}...`);

      try {
        logger.debug("Création de l'instance Firefox");
        const Firefox = new FirefoxExtensionInstaller(installerOptions);
        await Firefox.installExtensions([firefoxExtensionName]);
        logger.info("Installation de l'extension Firefox terminée avec succès");
      } catch (firefoxError) {
        logger.error(`Erreur spécifique à Firefox: ${firefoxError}`);
        throw firefoxError;
      }
    } else if (browser.toLowerCase() === "vivaldi") {
      logger.info("Installation pour Vivaldi - Initialisation");
      const vivaldiExtensionId = "hfkipjpbjnpdpaofpilegpmbbfhmoceb";
      logger.info(`Installation de l'extension pour Vivaldi avec ID ${vivaldiExtensionId}...`);

      try {
        const vivaldiInstaller = new Vivaldi(installerOptions);
        logger.debug("Instance Vivaldi créée, début de l'installation");
        await vivaldiInstaller.installExtension(vivaldiExtensionId);
        logger.info("Installation de l'extension Vivaldi terminée avec succès");
      } catch (vivaldiError) {
        logger.error(`Erreur spécifique à Vivaldi: ${vivaldiError}`);
        throw vivaldiError;
      }
    } else {
      logger.error(`Navigateur non supporté: ${browser}`);
      throw new Error(`Navigateur non supporté: ${browser}`);
    }

    logger.info(`Installation réussie pour ${browser}`);
    return Promise.resolve();
  } catch (error) {
    logger.error(`Erreur lors de l'installation de l'extension: ${error}`);
    return Promise.reject(error);
  }
}
