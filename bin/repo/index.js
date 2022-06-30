"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const pulumi = require("@pulumi/pulumi");
const github = require("@pulumi/github");
const pulumiservice = require("@pulumi/pulumiservice");
const automation_1 = require("@pulumi/pulumi/automation");
const AccessTokenEnvVar = "PULUMI_ACCESS_TOKEN";
const repoUpFunc = () => __awaiter(void 0, void 0, void 0, function* () {
});
class Repo {
    constructor({ sshUrl, branch }) {
        this.sshUrl = sshUrl;
        this.branch = branch;
    }
    static up({ name, owner }) {
        return __awaiter(this, void 0, void 0, function* () {
            const program = () => __awaiter(this, void 0, void 0, function* () {
                const branch = "main";
                const provider = new github.Provider("provider", {
                    owner: owner,
                });
                const opts = { provider: provider };
                const repo = new github.Repository("source", {
                    name: name,
                }, opts);
                const pulumiToken = new pulumiservice.AccessToken("sourceToken", {
                    description: pulumi.interpolate `token for github repo ${repo.fullName}`
                }, opts);
                const ghaSecret = new github.ActionsSecret("source-access-token", {
                    repository: repo.name,
                    secretName: AccessTokenEnvVar,
                    plaintextValue: pulumi.interpolate `${pulumiToken.value}`,
                }, opts);
                new github.RepositoryFile("push-action", {
                    repository: repo.name,
                    branch: branch,
                    file: ".github/workflows/pr.yml",
                    content: generateActionFile(),
                });
                const out = {
                    sshUrl: repo.sshCloneUrl.get(),
                    branch: branch,
                };
                return out;
            });
            const args = {
                stackName: `github-${name}`,
                projectName: "myles-hackathon",
                program: program,
            };
            // create (or select if one already exists) a stack that uses our inline program
            const stack = yield automation_1.LocalWorkspace.createOrSelectStack(args);
            console.info("successfully initialized stack");
            console.info("installing plugins...");
            yield stack.workspace.installPlugin("github", "v4.12.0");
            yield stack.workspace.installPlugin("pulumiservice", "v0.1.3");
            console.info("plugins installed");
            console.info("refreshing stack...");
            yield stack.refresh({ onOutput: console.info });
            console.info("refresh complete");
            console.info("updating stack...");
            const upRes = yield stack.up({ onOutput: console.info });
            const outputs = upRes.outputs;
            return new Repo(outputs);
        });
    }
}
exports.Repo = Repo;
function up(owner, source, automation) {
    return __awaiter(this, void 0, void 0, function* () {
        const program = () => __awaiter(this, void 0, void 0, function* () {
            const provider = new github.Provider("provider", {
                owner: owner,
            });
            const opts = { provider: provider };
            const sourceRepo = new github.Repository("source", {
                name: source,
            }, opts);
            const automationRepo = new github.Repository("automation", {
                name: automation,
            }, opts);
            const pulumiSourceToken = new pulumiservice.AccessToken("sourceToken", {
                description: pulumi.interpolate `token for github repo ${sourceRepo.fullName}`
            }, opts);
            const pulumiAutomationToken = new pulumiservice.AccessToken("automationToken", {
                description: pulumi.interpolate `token for github repo ${automationRepo.fullName}`
            }, opts);
            const sourceGhSecret = new github.ActionsSecret("source-access-token", {
                repository: sourceRepo.name,
                secretName: AccessTokenEnvVar,
                plaintextValue: pulumi.interpolate `${pulumiSourceToken.value}`,
            }, opts);
            return {
                source: {
                    ssh: sourceRepo.sshCloneUrl,
                    fullName: sourceRepo.fullName
                },
                automation: {
                    ssh: automationRepo.sshCloneUrl,
                    fullName: automationRepo.fullName,
                }
            };
        });
        const args = {
            stackName: "dev",
            projectName: "databaseMigration",
            program: program,
        };
        // create (or select if one already exists) a stack that uses our inline program
        const stack = yield automation_1.GitWorkspace.createOrSelectStack(args);
        console.info("successfully initialized stack");
        console.info("installing plugins...");
        yield stack.workspace.installPlugin("aws", "v4.0.0");
        yield stack.workspace.installPlugin("github", "v4.12.0");
        yield stack.workspace.installPlugin("pulumiservice", "v0.1.3");
        console.info("plugins installed");
        console.info("setting up config");
        console.info("refreshing stack...");
        yield stack.refresh({ onOutput: console.info });
        console.info("refresh complete");
        console.info("updating stack...");
        const upRes = yield stack.up({ onOutput: console.info });
    });
}
exports.up = up;
function generateActionFile() {
    return JSON.stringify({
        "name": "Pulumi",
        "on": {
            "push": {
                "paths": [
                    "Pulumi.yaml"
                ],
                "branches": [
                    "main"
                ]
            }
        },
        "env": {
            "PULUMI_ACCESS_TOKEN": "${{ secrets.PULUMI_ACCESS_TOKEN }}",
            "GOOGLE_APPLICATION_CREDENTIALS": "${{ secrets.GOOGLE_APPLICATION_CREDENTIALS }}",
            "GOOGLE_CLIENT_SECRET": "${{ secrets.GOOGLE_CLIENT_SECRET }}"
        },
        "jobs": {
            "update": {
                "name": "Update",
                "runs-on": "ubuntu-latest",
                "steps": [
                    {
                        "uses": "actions/checkout@v2"
                    },
                    {
                        "uses": "actions/checkout@v2",
                        "with": {
                            "path": "pulumi-yamltube",
                            "repository": "mchaynes/pulumi-yamltube",
                            "ref": "main"
                        }
                    },
                    {
                        "run": "pushd pulumi-yamltube && make provider && popd\n"
                    },
                    {
                        "run": "echo \"${{ github.workspace }}/pulumi-yamltube/bin\" >> $GITHUB_PATH"
                    },
                    {
                        "uses": "pulumi/actions@v3",
                        "env": {
                            "PULUMI_ACCESS_TOKEN": "${{ secrets.PULUMI_ACCESS_TOKEN }}",
                            "GOOGLE_APPLICATION_CREDENTIALS": "${{ secrets.GOOGLE_APPLICATION_CREDENTIALS }}"
                        },
                        "with": {
                            "command": "up",
                            "stack-name": "${{ secrets.STACK_NAME }}"
                        }
                    }
                ]
            }
        }
    });
}
//# sourceMappingURL=index.js.map