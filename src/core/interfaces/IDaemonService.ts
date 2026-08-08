export interface IDaemonService {
	resolveCommandAndArgs(cliArgs: string[]): { cmd: string; args: string[] };
}
