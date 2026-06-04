import type { ToolDef, ToolsOptions } from '../types.js';
import { copy } from './copy.js';
import { deleteFile } from './delete.js';
import { download } from './download.js';
import { downloadRange } from './download-range.js';
import { forkCreate } from './fork-create.js';
import { forkDelete } from './fork-delete.js';
import { forkHead } from './fork-head.js';
import { forkList } from './fork-list.js';
import { head } from './head.js';
import { list } from './list.js';
import { move } from './move.js';
import { snapshotCreate } from './snapshot-create.js';
import { snapshotDelete } from './snapshot-delete.js';
import { snapshotHead } from './snapshot-head.js';
import { snapshotList } from './snapshot-list.js';
import { upload } from './upload.js';
import { uploadUrl } from './upload-url.js';
import { url } from './url.js';

const ALL_TOOLS: ReadonlyArray<ToolDef> = [
  download,
  downloadRange,
  head,
  list,
  url,
  upload,
  deleteFile,
  copy,
  move,
  uploadUrl,
  snapshotCreate,
  snapshotList,
  snapshotHead,
  snapshotDelete,
  forkCreate,
  forkList,
  forkHead,
  forkDelete,
];

/**
 * Return the active tool set after applying `readOnly` filtering. Read
 * tools — including non-mutating snapshot/fork tools like
 * `snapshot_list` and `fork_head` — survive; only mutators (uploads,
 * deletes, copy/move, `snapshot_create`, `fork_create`, etc.) are
 * stripped.
 */
export function selectTools(options: ToolsOptions): ReadonlyArray<ToolDef> {
  if (!options.readOnly) return ALL_TOOLS;
  return ALL_TOOLS.filter((t) => t.access === 'read');
}
