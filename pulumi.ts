import { InlineProgramArgs, LocalWorkspace, PulumiFn } from "@pulumi/pulumi/automation";
import { projectName, pulumiProviders } from "./index";
import * as fs from 'fs';

export class Pulumi {
    static async up<T>(stackName: string, program: PulumiFn): Promise<T> {
        const inlineArgs: InlineProgramArgs = {
            stackName: stackName,
            projectName: projectName,
            program: program,
        };
        // create (or select if one already exists) a stack that uses our inline program
        const stack = await LocalWorkspace.createOrSelectStack(inlineArgs);

        // install all plugins/providers
        for (let [plugin, version] of Object.entries(pulumiProviders)) {
            await stack.workspace.installPlugin(plugin, version);
        }

        const history = await stack.history(100);
        let lastUpdateNum = 0;
        history.forEach(u => {
            lastUpdateNum = Math.max(lastUpdateNum, u.version);
        });

        console.log(`\n==== Start Pulumi.up() ====\nStack: '${stackName}'\n`);
        fs.mkdirSync("./logs", { recursive: true });
        const logPath = `logs/${stackName}-${lastUpdateNum + 1}.log`;
        console.log(`View Live: https://app.pulumi.com/myles/${projectName}/${stackName}/updates/${lastUpdateNum + 1}`);
        console.log(`(detailed local logs at: ${logPath})`);
        // a+ for append + reading
        const writeStream = fs.createWriteStream(logPath, { flags: "a+" });
        const upRes = await stack.up({ onOutput: (d) => writeStream.write(d), onEvent: (e) => writeStream.write(JSON.stringify(e)), showSecrets: true });
        writeStream.close();

        console.log("\nResult:\n");
        console.log(upRes.stdout.split("\n").filter(l => !l.includes("View Live: https://")).join("\n"));

        console.log(`\n====  End Pulumi.up()  ====`);

        const flattenedOutput: Record<string, unknown> = {};
        for (let [key, val] of Object.entries(upRes.outputs)) {
            flattenedOutput[key] = val.value;
        }
        return flattenedOutput as T;
    }
}