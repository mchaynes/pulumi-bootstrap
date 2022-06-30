"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalDockerMongo = exports.DocDb = void 0;
const command = __importStar(require("@pulumi/command"));
const automation_1 = require("@pulumi/pulumi/automation");
const fs = __importStar(require("fs"));
const yaml = __importStar(require("js-yaml"));
const mongodb_1 = require("mongodb");
const package_json_1 = require("./package.json");
class DocDb {
    static async up(stackName) {
        return new mongodb_1.MongoClient("");
    }
}
exports.DocDb = DocDb;
const dockerServiceName = "mongo";
const mongoPort = "27017";
const exposedPort = "27017";
class LocalDockerMongo {
    static async up(stackName) {
        const sourceRoot = process.cwd();
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
        const inlineArgs = {
            stackName: stackName,
            projectName: "myles-hackathon",
            program: program,
        };
        // create (or select if one already exists) a stack that uses our inline program
        const stack = await automation_1.LocalWorkspace.createOrSelectStack(inlineArgs);
        console.info("successfully initialized stack");
        console.info("installing plugins...");
        for (let [plugin, version] of Object.entries(package_json_1.pulumiPlugins)) {
            await stack.workspace.installPlugin(plugin, version);
        }
        console.info("plugins installed");
        const upRes = await stack.up({ onOutput: console.info, onEvent: (e) => console.warn(JSON.stringify(e)) });
        console.log(JSON.stringify(upRes, null, 2));
        const { username, password, port, host } = upRes.outputs;
        const client = new mongodb_1.MongoClient(`mongodb://${username.value}:${password.value}@${host.value}:${port.value}/`);
        return client;
    }
}
exports.LocalDockerMongo = LocalDockerMongo;
function dockerComposeYaml(username, password) {
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
//# sourceMappingURL=mongo.js.map