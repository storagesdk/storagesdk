import * as fsp from 'node:fs/promises';
import { asStorageError } from './errors.js';
import { sidecarPath } from './paths.js';

export interface SidecarData {
  contentType?: string;
  metadata?: Readonly<Record<string, string>>;
}

/**
 * Looser shape callers can construct without filtering `undefined` fields
 * (so call-site code like `{ contentType: opts?.contentType }` typechecks
 * under `exactOptionalPropertyTypes`). `writeSidecar` filters `undefined`
 * out before deciding whether to write.
 */
export interface SidecarInput {
  contentType?: string | undefined;
  metadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * Reads the sidecar JSON next to `filePath`. Returns `undefined` if the
 * sidecar doesn't exist (the common case — sidecars are only written when
 * there's something non-default to preserve). Other I/O errors propagate.
 */
export async function readSidecar(
  filePath: string
): Promise<SidecarData | undefined> {
  try {
    const text = await fsp.readFile(sidecarPath(filePath), 'utf8');
    return JSON.parse(text) as SidecarData;
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      return undefined;
    }
    throw asStorageError(err);
  }
}

/**
 * Writes the sidecar if there's anything worth preserving (non-default
 * contentType or any user metadata). If the sidecar would be empty, removes
 * any existing sidecar instead. Returns silently in either case.
 */
export async function writeSidecar(
  filePath: string,
  data: SidecarInput
): Promise<void> {
  const payload: SidecarData = {};
  if (data.contentType !== undefined) payload.contentType = data.contentType;
  if (data.metadata !== undefined && Object.keys(data.metadata).length > 0) {
    payload.metadata = data.metadata;
  }

  if (Object.keys(payload).length === 0) {
    await deleteSidecar(filePath);
    return;
  }

  try {
    await fsp.writeFile(sidecarPath(filePath), JSON.stringify(payload));
  } catch (err) {
    throw asStorageError(err);
  }
}

/** Removes the sidecar if it exists. No-op if missing. */
export async function deleteSidecar(filePath: string): Promise<void> {
  try {
    await fsp.rm(sidecarPath(filePath), { force: true });
  } catch (err) {
    throw asStorageError(err);
  }
}

/**
 * Move sidecar alongside a `copy` or `move` of the primary file. When the
 * source has no sidecar, any stale sidecar at the destination is removed
 * so the destination's metadata always matches the source's.
 */
export async function copySidecar(
  fromPath: string,
  toPath: string
): Promise<void> {
  try {
    await fsp.copyFile(sidecarPath(fromPath), sidecarPath(toPath));
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      // Source has no sidecar; clear any stale sidecar at the destination.
      await deleteSidecar(toPath);
      return;
    }
    throw asStorageError(err);
  }
}

export async function renameSidecar(
  fromPath: string,
  toPath: string
): Promise<void> {
  try {
    await fsp.rename(sidecarPath(fromPath), sidecarPath(toPath));
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      // Source has no sidecar; clear any stale sidecar at the destination.
      await deleteSidecar(toPath);
      return;
    }
    throw asStorageError(err);
  }
}
