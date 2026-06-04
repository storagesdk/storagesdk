import type { UploadUrlResult } from '@storagesdk/core';
import { z } from 'zod';
import { checkScope } from '../scope.js';
import type { ToolDef } from '../types.js';
import { storageAt } from './shared.js';

const schema = z.object({
  path: z.string().describe('The destination file path.'),
  expiresIn: z.number().int().min(1).optional().describe('URL TTL in seconds.'),
  contentType: z
    .string()
    .optional()
    .describe('Required content type the upload must declare.'),
  maxSize: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Maximum upload size in bytes (enforced server-side via POST policy where supported).'
    ),
  fork: z
    .string()
    .optional()
    .describe(
      'Target a fork by name. Omit to write to the parent (live) storage.'
    ),
});

export const uploadUrl: ToolDef = {
  name: 'upload_url',
  description:
    'Get a presigned upload URL. Hand this to a client (browser, mobile app, separate process) so it can upload directly to storage without proxying bytes through the agent. Use when the body is binary or large.',
  access: 'write',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<UploadUrlResult> {
    checkScope(ctx.options.scope, input.path);
    const handle = storageAt(ctx.storage, input);
    return handle.uploadUrl(input.path, {
      expiresIn: input.expiresIn ?? ctx.options.urlExpiresIn,
      ...(input.contentType ? { contentType: input.contentType } : {}),
      ...(input.maxSize !== undefined ? { maxSize: input.maxSize } : {}),
      ...(ctx.options.signal ? { signal: ctx.options.signal } : {}),
    });
  },
};
