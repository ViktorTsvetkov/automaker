import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findNodeExecutable, buildEnhancedPath } from '../src/node-finder.js';
import path from 'path';

describe('node-finder', () => {
  describe('findNodeExecutable', () => {
    it("should return 'node' with fallback source when skipSearch is true", () => {
      const result = findNodeExecutable({ skipSearch: true });

      expect(result.nodePath).toBe('node');
      expect(result.source).toBe('fallback');
    });

    it('should call logger when node is found', () => {
      const logger = vi.fn();
      findNodeExecutable({ logger });

      // Logger should be called at least once (either found or fallback message)
      expect(logger).toHaveBeenCalled();
    });

    it('should return a valid NodeFinderResult structure', () => {
      const result = findNodeExecutable();

      expect(result).toHaveProperty('nodePath');
      expect(result).toHaveProperty('source');
      expect(typeof result.nodePath).toBe('string');
      expect(result.nodePath.length).toBeGreaterThan(0);
    });

    it('should find node on the current system', () => {
      // This test verifies that node can be found on the test machine
      const result = findNodeExecutable();

      // Should find node since we're running in Node.js
      expect(result.nodePath).toBeDefined();

      // Source should be one of the valid sources
      const validSources = [
        'homebrew',
        'system',
        'nvm',
        'fnm',
        'nvm-windows',
        'program-files',
        'scoop',
        'chocolatey',
        'which',
        'where',
        'fallback',
      ];
      expect(validSources).toContain(result.source);
    });
  });

  describe('buildEnhancedPath', () => {
    const delimiter = path.delimiter;

    it("should return current path unchanged when nodePath is 'node'", () => {
      const currentPath = '/usr/bin:/usr/local/bin';
      const result = buildEnhancedPath('node', currentPath);

      expect(result).toBe(currentPath);
    });

    it("should return empty string when nodePath is 'node' and currentPath is empty", () => {
      const result = buildEnhancedPath('node', '');

      expect(result).toBe('');
    });

    it('should prepend node directory to path', () => {
      const nodePath = '/opt/homebrew/bin/node';
      const currentPath = '/usr/bin:/usr/local/bin';

      const result = buildEnhancedPath(nodePath, currentPath);

      expect(result).toBe(`/opt/homebrew/bin${delimiter}${currentPath}`);
    });

    it('should not duplicate node directory if already in path', () => {
      const nodePath = '/usr/local/bin/node';
      const currentPath = '/usr/local/bin:/usr/bin';

      const result = buildEnhancedPath(nodePath, currentPath);

      expect(result).toBe(currentPath);
    });

    it('should handle empty currentPath', () => {
      const nodePath = '/opt/homebrew/bin/node';

      const result = buildEnhancedPath(nodePath, '');

      expect(result).toBe(`/opt/homebrew/bin${delimiter}`);
    });

    it('should handle Windows-style paths', () => {
      const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
      const currentPath = 'C:\\Windows\\System32';

      const result = buildEnhancedPath(nodePath, currentPath);

      expect(result).toBe(`C:\\Program Files\\nodejs${delimiter}${currentPath}`);
    });

    it('should use default empty string for currentPath', () => {
      const nodePath = '/usr/local/bin/node';

      const result = buildEnhancedPath(nodePath);

      expect(result).toBe(`/usr/local/bin${delimiter}`);
    });
  });
});
