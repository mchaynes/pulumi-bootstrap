import * as command from '@pulumi/command';
import { Command } from '@pulumi/command/local';
import { GitWorkspace, InlineProgramArgs, SshConfig } from "@pulumi/pulumi/automation";
import packageJson from "./package.json";

export class Cmd {
    static async up(stackName: string, sshConfig: SshConfig) {
        const program = async () => {
            const cmd = new command.local.Command("command", {
                dir: sshConfig.workDir,
                create: "git init",
                update: "git st",
            });

            return {
                output: cmd.stdout,
            };
        };

        const inlineArgs: InlineProgramArgs = {
            stackName: `remote-cmd`,
            projectName: "myles-hackathon",
            program: program,
        };
        // create (or select if one already exists) a stack that uses our inline program
        const stack = await GitWorkspace.createOrSelectStack(inlineArgs, {
            gitRemote: sshConfig,
            packageJson: JSON.stringify(packageJson, null, 4)
        });

        console.info("successfully initialized stack");
        console.info("installing plugins...");
        const plugins = {
            "github": "v4.12.0",
            "pulumiservice": "v0.1.3",
            "aws": "v5.9.1"
        };
        for (let [plugin, version] of Object.entries(plugins)) {
            await stack.workspace.installPlugin(plugin, version);
        }
        console.info("plugins installed");
        const upRes = await stack.up({ onOutput: console.info, onEvent: (e) => console.warn(JSON.stringify(e)) });

    }
}