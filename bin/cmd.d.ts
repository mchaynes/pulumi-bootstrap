import { SshConfig } from "@pulumi/pulumi/automation";
export declare class Cmd {
    static up(stackName: string, sshConfig: SshConfig): Promise<void>;
}
