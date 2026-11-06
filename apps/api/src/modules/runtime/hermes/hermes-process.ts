import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  resolveHermesExecutable,
  runCapturedHermesCommand,
  type HermesCommandResult,
  type HermesCommandRunner,
} from './hermes-command';

@Injectable()
export class HermesProcess implements HermesCommandRunner {
  private executable: string | null = null;

  constructor(private readonly config: ConfigService) {}

  async run(args: readonly string[]): Promise<HermesCommandResult> {
    const executable = await this.executablePath();
    return runCapturedHermesCommand({ executable, args });
  }

  private async executablePath(): Promise<string> {
    if (this.executable) {
      return this.executable;
    }
    const configured = this.config.get<string>('HERMES_EXECUTABLE');
    const executable = await resolveHermesExecutable(configured);
    this.executable = executable;
    return executable;
  }
}
