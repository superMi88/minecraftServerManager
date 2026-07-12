import { ChildProcess, SpawnOptions } from 'child_process';

export interface StartResult {
  success: boolean;
  message?: string;
  command?: string;
  args?: string[];
  options?: SpawnOptions;
}

export interface GameServerHandler {
  preStart?(folderPath: string, config: Record<string, unknown>): Promise<void>;
  getStartCommand(folderPath: string, config: Record<string, unknown>): Promise<StartResult>;
  stop(process: ChildProcess, folderPath: string): Promise<{ success: boolean; message?: string }>;
  sendCommand(process: ChildProcess, command: string): Promise<{ success: boolean; message?: string }>;
  getProperties(folderPath: string, config: Record<string, unknown>): Promise<string>;
  saveProperties(folderPath: string, content: string, config: Record<string, unknown>): Promise<void>;
  install?(folderPath: string, logCallback: (data: string) => void): Promise<{ success: boolean; message: string }>;
}
