import { ToolRunner } from '@actions/exec/lib/toolrunner';
import { ExecOptions } from '@actions/exec/lib/interfaces';
import * as io from '@actions/io';

export class DockerHelper {
    public async executeDockerCommand(args: string[]) {
        const dockerPath = await io.which('docker', true);
        const options: ExecOptions = {
            silent: true
        };

        const dockerCommand = new ToolRunner(dockerPath, args, options);
        return dockerCommand.exec();
    }
}