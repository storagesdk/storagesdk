import { Storage } from "@storagesdk/core";

export interface ShellOptions {
  /** Starting working directory and auto-mount point, defaults to /workspace. */
  cwd?: string;
  /** Initial environment variables for the shell. */
  env?: Record<string, string>;
  /** Storage backend for the shell. */
  storage: Storage;
};