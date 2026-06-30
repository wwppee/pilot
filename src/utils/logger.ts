/**
 * Logger — thin wrapper around kleur for consistent colored output.
 *
 * Why not console.log directly? Because we want:
 *  - automatic TTY detection (no colors when piped)
 *  - consistent prefix format
 *  - one place to swap impls later (e.g. JSON output for CI)
 */

import kleur from 'kleur';
import type { Logger } from '../core/types.js';

const isTTY = process.stdout.isTTY ?? false;
kleur.enabled = isTTY;

const prefix = (icon: string, color: (s: string) => string) => (msg: string): string =>
  `${color(icon)} ${msg}`;

export const logger: Logger = {
  info: (msg) => console.log(prefix('ℹ', kleur.cyan)(msg)),
  warn: (msg) => console.warn(prefix('⚠', kleur.yellow)(msg)),
  error: (msg) => console.error(prefix('✗', kleur.red)(msg)),
  success: (msg) => console.log(prefix('✓', kleur.green)(msg)),
  dim: (msg) => console.log(kleur.dim(msg)),
};