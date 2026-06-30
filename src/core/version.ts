/**
 * Build-time version string. Read from package.json so /health,
 * CLI banner, and npm releases never drift apart.
 *
 * resolveJsonModule is enabled in tsconfig — this is bundled at build time.
 */
import packageJson from '../../package.json' with { type: 'json' };

/** Current Pilot version (e.g. "0.2.0"). */
export const VERSION: string = packageJson.version;