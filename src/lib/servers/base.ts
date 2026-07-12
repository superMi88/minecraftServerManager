import { ChildProcess } from 'child_process';

export interface StartResult {
  success: boolean;
  message?: string;
  command?: string;
  args?: string[];
  options?: any;
}

export interface GameServerHandler {
  preStart?(folderPath: string, config: any): Promise<void>;
  getStartCommand(folderPath: string, config: any): Promise<StartResult>;
  stop(process: ChildProcess, folderPath: string): Promise<{ success: boolean; message?: string }>;
  sendCommand(process: ChildProcess, command: string): Promise<{ success: boolean; message?: string }>;
  getProperties(folderPath: string, config: any): Promise<string>;
  saveProperties(folderPath: string, content: string, config: any): Promise<void>;
  install?(folderPath: string, logCallback: (data: string) => void): Promise<{ success: boolean; message: string }>;
}
