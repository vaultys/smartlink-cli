import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { installExtensionCommand } from "./installExtension";
import { createLogger } from "./utils/logger";

// Créer un logger par défaut pour le CLI
const logger = createLogger({ name: "CLI" });

const cli = yargs(hideBin(process.argv))
  .scriptName("smartlink-cli")
  .middleware((argv) => {
    if (argv.logLevel) {
      const newLogger = createLogger({
        logLevel: argv.logLevel as string,
        name: "CLI",
      });

      Object.assign(logger, newLogger);

      logger.debug(`Niveau de log configuré à ${argv.logLevel}`);
    }
  })
  .command(
    "install-extension",
    "Install the SmartLink extension in the specified browser and specified profiles",
    (yargs) => {
      yargs.option("browser", {
        describe: "Browser to install the extension",
        type: "string",
        choices: ["chrome", "firefox", "edge", "opera", "brave", "vivaldi"],
        default: "chrome",
      });
      yargs.option("smartLinkUrl", {
        describe: "URL of the SmartLink to init the extension",
        type: "string",
      });
      yargs.option("secret", {
        describe: "Secret to init the extension",
        type: "string",
      });
      yargs.option("profiles", {
        describe: "Browser profiles to install the extension to (comma-separated)",
        type: "string",
        coerce: (arg) => (arg ? arg.split(",") : undefined),
      });
      yargs.option("installDir", {
        describe: "Custom browser user data directory",
        type: "string",
      });
      yargs.option("downloadDir", {
        describe: "Directory to download extension files temporarily",
        type: "string",
      });
      yargs.option("forceReinstall", {
        describe: "Force reinstall even if extension exists",
        type: "boolean",
        default: false,
      });
      yargs.option("logLevel", {
        describe: "Log level: trace, debug, info, warn, error, fatal",
        type: "string",
        choices: ["trace", "debug", "info", "warn", "error", "fatal"],
        default: "info",
      });
      yargs.option("pinExtension", {
        describe: "Pin the extension in the browser",
        type: "boolean",
        default: false,
      });
    },
    async (argv) => {
      logger.debug(`Exécution de la commande install-extension avec les options: ${JSON.stringify(argv)}`);
      await installExtensionCommand(argv);
    }
  )

  .fail((msg, err, yargs) => {
    if (err) {
      logger.error(`Erreur: ${err.message}`);
    } else {
      logger.error(`Message d'erreur: ${msg}`);
    }
    process.exit(1);
  })

  .demandCommand(1, "You need at least one command before moving on")
  .help().argv;
