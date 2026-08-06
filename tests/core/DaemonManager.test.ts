import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaemonManager } from '../../src/core/DaemonManager';

vi.mock('vscode', () => {
  return {
    window: {
      createStatusBarItem: vi.fn(() => ({
        show: vi.fn(),
        hide: vi.fn(),
        text: '',
        tooltip: '',
        command: ''
      })),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultValue?: any) => defaultValue)
      })),
      workspaceFolders: []
    },
    StatusBarAlignment: {
      Right: 2
    }
  };
});

describe('DaemonManager', () => {
  let daemonManager: DaemonManager;

  beforeEach(() => {
    // Reset instance for clean tests
    // @ts-ignore
    DaemonManager.instance = undefined;
    daemonManager = DaemonManager.getInstance();
  });

  it('should be a singleton', () => {
    const instance2 = DaemonManager.getInstance();
    expect(daemonManager).toBe(instance2);
  });

  it('should resolve default CLI path when no config is provided', () => {
    const cliPath = daemonManager.resolveCliPath();
    expect(cliPath).toBe('npx tuquet-automa-cli');
  });

  it('should resolve command and args with npx fallback', () => {
    const { cmd, args } = daemonManager.resolveCommandAndArgs(['serve']);
    const expectedCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    expect(cmd).toBe(expectedCmd);
    expect(args).toEqual(['-y', 'tuquet-automa-cli@latest', 'serve']);
  });
});
