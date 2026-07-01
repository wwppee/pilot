import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deleteProfile,
  listProfiles,
  profilePath,
  readProfile,
  tryReadProfile,
  writeProfile,
} from '../../src/core/profile.js';

describe('profile', () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'pilot-profile-test-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  // ─── profilePath ─────────────────────────────────────

  describe('profilePath', () => {
    it('returns path for valid kebab-case name', () => {
      expect(profilePath('work-frontend', tempHome)).toMatch(/profiles[/\\]work-frontend\.toml$/);
    });

    it('throws on invalid names', () => {
      expect(() => profilePath('Work Frontend', tempHome)).toThrow();
      expect(() => profilePath('Work_Frontend', tempHome)).toThrow();
      expect(() => profilePath('', tempHome)).toThrow();
      expect(() => profilePath('-leading', tempHome)).toThrow();
    });
  });

  // ─── listProfiles (empty) ────────────────────────────

  describe('listProfiles', () => {
    it('returns [] when profiles dir does not exist', async () => {
      const profiles = await listProfiles(tempHome);
      expect(profiles).toEqual([]);
    });
  });

  // ─── writeProfile + readProfile ──────────────────────

  describe('writeProfile + readProfile', () => {
    it('creates a profile and reads it back', async () => {
      const created = await writeProfile('work-frontend', { model: 'claude-opus-4.6' }, tempHome);
      expect(created.name).toBe('work-frontend');
      expect(created.model).toBe('claude-opus-4.6');
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();

      const read = await readProfile('work-frontend', tempHome);
      expect(read.model).toBe('claude-opus-4.6');
      expect(read.name).toBe('work-frontend');
    });

    it('preserves createdAt on update', async () => {
      const first = await writeProfile('work', { model: 'a' }, tempHome);
      const firstCreatedAt = first.createdAt;

      // Wait a bit to ensure updatedAt differs
      await new Promise((r) => setTimeout(r, 10));
      const second = await writeProfile('work', { model: 'b' }, tempHome);

      expect(second.createdAt).toBe(firstCreatedAt);
      expect(second.updatedAt).not.toBe(firstCreatedAt);
    });

    it('rejects invalid name', async () => {
      await expect(writeProfile('Bad Name', {}, tempHome)).rejects.toThrow();
    });

    it('rejects invalid thinking level', async () => {
      await expect(
        writeProfile('work', { thinking: 'invalid' as never }, tempHome),
      ).rejects.toThrow();
    });
  });

  // ─── tryReadProfile ───────────────────────────────────

  describe('tryReadProfile', () => {
    it('returns null for missing profile', async () => {
      expect(await tryReadProfile('missing', tempHome)).toBeNull();
    });

    it('returns the profile when present', async () => {
      await writeProfile('work', { model: 'claude-opus-4.6' }, tempHome);
      const p = await tryReadProfile('work', tempHome);
      expect(p?.name).toBe('work');
      expect(p?.model).toBe('claude-opus-4.6');
    });
  });

  // ─── listProfiles (with entries) ─────────────────────

  describe('listProfiles with entries', () => {
    it('returns all profiles, skipping invalid ones', async () => {
      await writeProfile('a', { model: 'claude-opus-4.6' }, tempHome);
      await writeProfile('b', { thinking: 'high' }, tempHome);

      // Write an invalid TOML file
      const { writeFileSync } = await import('node:fs');
      const dir = join(tempHome, '.pilot/profiles');
      writeFileSync(join(dir, 'broken.toml'), '{ not valid toml');

      const profiles = await listProfiles(tempHome);
      expect(profiles).toHaveLength(2);
      const names = profiles.map((p) => p.name).sort();
      expect(names).toEqual(['a', 'b']);
    });
  });

  // ─── deleteProfile ───────────────────────────────────

  describe('deleteProfile', () => {
    it('returns true when profile existed', async () => {
      await writeProfile('work', { model: 'a' }, tempHome);
      const deleted = await deleteProfile('work', tempHome);
      expect(deleted).toBe(true);
      expect(await tryReadProfile('work', tempHome)).toBeNull();
    });

    it('returns false when profile did not exist', async () => {
      const deleted = await deleteProfile('never-existed', tempHome);
      expect(deleted).toBe(false);
    });
  });
});