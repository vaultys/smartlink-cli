import { exec, execSync } from "child_process";
import os from "os";
import process from "process";
import { Browser } from "../type";
import { BrowserProcesses } from "./constants";

export class BrowserController {
  static async close(browser: Browser): Promise<void> {
    const myPID = process.pid;
    const platform = os.platform();

    for (const procName of BrowserProcesses[browser]) {
      try {
        let pids: string[] = [];

        if (platform === "win32") {
          // Windows : utiliser 'tasklist' et 'taskkill'
          const taskList = execSync(`tasklist`).toString();
          const lines = taskList.split("\n");
          for (const line of lines) {
            if (line.toLowerCase().includes(procName.toLowerCase())) {
              const match = line.match(/^(.+?)\s+(\d+)/);
              if (match) {
                const pid = match[2];
                pids.push(pid);
              }
            }
          }
          for (const pid of pids) {
            if (parseInt(pid, 10) !== myPID) {
              execSync(`taskkill /PID ${pid} /F`);
            }
          }
        } else {
          // Unix (Linux/macOS)
          const output = execSync(`pgrep -f ${procName}`).toString();
          pids = output
            .split("\n")
            .map((p) => p.trim())
            .filter((p) => p !== "");

          for (const pid of pids) {
            if (parseInt(pid, 10) !== myPID) {
              execSync(`kill ${pid} > /dev/null 2>&1`);
            }
          }
        }
      } catch (error) {}
    }
  }

  static async openWithUrl(browser: Browser, url: string, profileName?: string): Promise<void> {
    try {
      let command: string;

      if (process.platform === "win32") {
        switch (browser) {
          case "firefox":
            command = `start firefox.exe ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "chrome":
            command = `start chrome ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "edge":
            command = `start msedge ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "opera":
            command = `start "$env:LOCALAPPDATA\\Programs\\Opera\\opera.exe" ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "brave":
            command = `start brave ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "vivaldi":
            command = `start "$env:LOCALAPPDATA\\Vivaldi\\Application\\vivaldi.exe" ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          default:
            throw new Error(`Navigateur non supporté: ${browser}`);
        }
      } else if (process.platform === "darwin") {
        switch (browser) {
          case "firefox":
            command = `/Applications/Firefox.app/Contents/MacOS/firefox ${profileName ? `-P "${profileName}"` : ""} "${url}"`;
            break;
          case "chrome":
            command = `open -a "Google Chrome" --args ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "edge":
            command = `open -a "Microsoft Edge" --args ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "opera":
            command = `open -a "Opera" --args ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "brave":
            command = `open -a "Brave Browser" --args ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "vivaldi":
            command = `open -a "Vivaldi" --args ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          default:
            throw new Error(`Navigateur non supporté: ${browser}`);
        }
      } else {
        // Linux
        switch (browser) {
          case "firefox":
            command = `firefox ${profileName ? `-P "${profileName}"` : ""} "${url}"`;
            break;
          case "chrome":
            command = `google-chrome ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "edge":
            command = `microsoft-edge ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "opera":
            command = `opera ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "brave":
            command = `brave-browser ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          case "vivaldi":
            command = `vivaldi ${profileName ? `--profile-directory="${profileName}"` : ""} "${url}"`;
            break;
          default:
            throw new Error(`Navigateur non supporté: ${browser}`);
        }
      }

      // Exécute le navigateur avec l'URL
      exec(command);

      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Fermer le navigateur
      await BrowserController.close(browser);
    } catch (error) {
      console.error(`Échec de l'ouverture de ${browser} avec l'URL: ${error}`);
      throw error;
    }
  }
}
