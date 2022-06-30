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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cmd = void 0;
const command = __importStar(require("@pulumi/command"));
const automation_1 = require("@pulumi/pulumi/automation");
const package_json_1 = __importDefault(require("./package.json"));
class Cmd {
    static async up(stackName, sshConfig) {
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
        const inlineArgs = {
            stackName: `remote-cmd`,
            projectName: "myles-hackathon",
            program: program,
        };
        // create (or select if one already exists) a stack that uses our inline program
        const stack = await automation_1.GitWorkspace.createOrSelectStack(inlineArgs, {
            gitRemote: sshConfig,
            packageJson: JSON.stringify(package_json_1.default, null, 4)
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
exports.Cmd = Cmd;
//# sourceMappingURL=cmd.js.map