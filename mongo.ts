import * as command from '@pulumi/command';
import { InlineProgramArgs, LocalWorkspace } from '@pulumi/pulumi/automation';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { MongoClient } from "mongodb";
import { pulumiPlugins } from './package.json';


export class DocDb {
    static async up(stackName: string): Promise<MongoClient> {
        return new MongoClient("");
    }
}

const dockerServiceName = "mongo";
const mongoPort = "27017";
const exposedPort = "27017";


export class LocalDockerMongo {
    static async up(stackName: string): Promise<MongoClient> {
        const sourceRoot = process.cwd();

        type OutputVal = {
            value: string;
        }

        type Output = {
            username: OutputVal;
            password: OutputVal;
            host: OutputVal;
            port: OutputVal;
        };

        // Because we're just using docker compose, 
        // running this pulumi program is completely unnecessary.
        // We could just do it inline. But when we run it in a pulumi program
        // we get some nice properties like a history of runs and engine events
        // inside the pulumi service
        const program = async () => {

            const username = "root"; // you should use `new random.RandomPassword()`
            const password = "password"; // you should use `new random.RandomPassword()`

            const dockerYaml = dockerComposeYaml(username, password);

            const dockerYamlFile = `${sourceRoot}/${stackName}.stack.yaml`;

            await fs.promises.writeFile(`${sourceRoot}/${stackName}.stack.yaml`, dockerYaml);

            new command.local.Command("update", {
                update: `docker-compose -f ${dockerYamlFile} up --wait ${dockerServiceName}`,
            });
            return {
                username: username,
                password: password,
                host: "127.0.0.1",
                port: exposedPort,
            };
        };

        const inlineArgs: InlineProgramArgs = {
            stackName: stackName,
            projectName: "myles-hackathon",
            program: program,
        };
        // create (or select if one already exists) a stack that uses our inline program
        const stack = await LocalWorkspace.createOrSelectStack(inlineArgs);

        console.info("successfully initialized stack");
        console.info("installing plugins...");
        for (let [plugin, version] of Object.entries(pulumiPlugins)) {
            await stack.workspace.installPlugin(plugin, version);
        }
        console.info("plugins installed");
        const upRes = await stack.up({ onOutput: console.info, onEvent: (e) => console.warn(JSON.stringify(e)) });

        console.log(JSON.stringify(upRes, null, 2))

        const { username, password, port, host } = upRes.outputs as unknown as Output;

        const client = new MongoClient(`mongodb://${username.value}:${password.value}@${host.value}:${port.value}/`);
        return client;
    }
}


function dockerComposeYaml(username: string, password: string) {
    return yaml.dump({
        version: "3.1",
        services: {
            [dockerServiceName]: {
                "image": "mongo",
                "restart": "always",
                "environment": {
                    "MONGO_INITDB_ROOT_USERNAME": username,
                    "MONGO_INITDB_ROOT_PASSWORD": password,
                },
                ports: [
                    `${mongoPort}:${exposedPort}`
                ]
            },
        }
    }, { noRefs: true });
}