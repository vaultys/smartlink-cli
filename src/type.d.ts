export type Browser = "chrome" | "firefox" | "edge" | "vivaldi" | "brave" | "opera";
interface InstallerOptions {
  profiles?: string[];
  installDir?: string;
  downloadDir?: string;
  forceReinstall?: boolean;
  logLevel?: string;
  pinExtension?: boolean;
  config?: {
    smartLinkUrl?: string;
    secret?: string;
  };
}
