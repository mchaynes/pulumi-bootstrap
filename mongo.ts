import { spawnSync } from 'child_process';
import { InlineProgramArgs, LocalWorkspace } from '@pulumi/pulumi/automation';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { MongoClient } from "mongodb";
import { projectName } from './index';
import { Pulumi } from './pulumi';
import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'
import * as random from '@pulumi/random'


export class DocDb {
    static program(stackName: string) {
        return async () => {
            const password = new random.RandomPassword("password", {
                length: 8,
            })
            const docdb = new aws.docdb.Cluster("docdb", {
                backupRetentionPeriod: 5,
                clusterIdentifier: "",
                engine: "docdb",
                masterPassword: password.result,
                masterUsername: "foo",
                preferredBackupWindow: "07:00-09:00",
                skipFinalSnapshot: true,
            });
    
            const output: MongoUpOutputs = {
                username: docdb.masterUsername,
                password: password.result,
                host: docdb.endpoint,
                port: docdb.port.apply(n => {
                    if (!n) {
                        throw new Error("docdb port must be set")
                    }
                    return `${n}`
                }),
            }
            return output
        }
    }
    static async up(stackName: string): Promise<MongoUpOutputs>  {
        return await Pulumi.up(stackName, DocDb.program(stackName))
    }
}

const dockerServiceName = "mongo";
const mongoPort = "27017";
const exposedPort = "27017";


export type MongoUpOutputs = {
    username: string | pulumi.Output<string>;
    password: string | pulumi.Output<string>;
    host: string | pulumi.Output<string>;
    port: string | pulumi.Output<string>;
};


/**
 * LocalDockerMongo spins up local docker instance of mongo using
 * docker-compose
 */
export class LocalDockerMongo {
    // Because we're just using docker compose,
    // running this as a pulumi program isn't unnecessary.
    // We could just do it inline. But when we run it in a pulumi program
    // we get some nice properties like a history of "what happened" and engine events
    // inside the pulumi service
    static program(stackName: string, sourceRoot: string) {
        return async (): Promise<MongoUpOutputs> => {
            const username = "root"; // you should use `new random.RandomPassword()`
            const password = "password"; // you should use `new random.RandomPassword()`

            const dockerYaml = dockerComposeYaml(username, password);

            const dockerYamlFile = `${sourceRoot}/bin/${stackName}.stack.yaml`;

            // create file
            await fs.promises.writeFile(`${dockerYamlFile}`, dockerYaml);

            spawnSync(`docker-compose down -f ${dockerYamlFile} --timeout 60`);

            spawnSync(`docker-compose -f ${dockerYamlFile} up --wait ${dockerServiceName} --quiet-pull`);

            // strongly typed output properties
            const output: MongoUpOutputs = {
                // this is obviously silly because we're hard coding the values above
                username: pulumi.secret(username),
                password: pulumi.secret(password),
                host: "127.0.0.1",
                port: exposedPort,
            };
            return output
        };
    }

    static async up(stackName: string): Promise<MongoClient> {
        const sourceRoot = process.cwd();

        // typing on output properties 🎉
        const output = await Pulumi.up<MongoUpOutputs>(stackName, LocalDockerMongo.program(stackName, sourceRoot));
        const client = new MongoClient(formatMongoUrl(output));
        return client;
    }
}

export function formatMongoUrl({username, password, host, port}: MongoUpOutputs) {
    return `mongodb://${username}:${password}@${host}:${port}/`
}

/**
 * Generates the docker compose yaml
 */
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