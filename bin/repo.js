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
exports.Branch = exports.Repo = exports.GithubToAwsAuth = void 0;
const pulumi = __importStar(require("@pulumi/pulumi"));
const github = __importStar(require("@pulumi/github"));
const pulumiservice = __importStar(require("@pulumi/pulumiservice"));
const aws = __importStar(require("@pulumi/aws"));
const yaml = __importStar(require("js-yaml"));
const automation_1 = require("@pulumi/pulumi/automation");
const index_1 = require("./index");
const package_json_1 = require("./package.json");
const defaultBranch = "main";
class GithubToAwsAuth {
    static async up(stackName, { repoName, repoOwner }) {
        const program = async () => {
            const oidcHost = `token.actions.githubusercontent.com`;
            const oidcUrl = `https://${oidcHost}`;
            const partition = await aws.getPartition();
            const clientIdList = [`https://github.com/${repoOwner}`, "sts.amazonaws.com"];
            const oidcProvider = new aws.iam.OpenIdConnectProvider("secure-cloud-access", {
                // thumbprint specific to GitHub and never changes 
                // well, usually never changes:
                // https://github.blog/changelog/2022-01-13-github-actions-update-on-oidc-based-deployments-to-aws/
                thumbprintLists: ["6938fd4d98bab03faadb97b34396831e3780aea1"],
                clientIdLists: clientIdList,
                url: oidcUrl,
            });
            const role = new aws.iam.Role("secure-cloud-access", {
                description: `Access for github.com/${repoOwner}/${repoName}`,
                assumeRolePolicy: {
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Action: ["sts:AssumeRoleWithWebIdentity"],
                            Effect: "Allow",
                            Condition: {
                                StringLike: {
                                    "token.actions.githubusercontent.com:sub": `repo:${repoOwner}/${repoName}:*`,
                                },
                            },
                            Principal: {
                                Federated: [oidcProvider.arn],
                            },
                        },
                    ],
                },
            });
            new aws.iam.PolicyAttachment("access", {
                policyArn: `arn:${partition.partition}:iam::aws:policy/AdministratorAccess`,
                roles: [role.name],
            });
            new github.ActionsSecret("roleArnSecret", {
                repository: repoName,
                secretName: index_1.EnvVars.ROLE_ARN,
                plaintextValue: pulumi.interpolate `${role.arn}`,
            });
        };
        const inlineArgs = {
            stackName: `github-aws-${stackName}`,
            projectName: "myles-hackathon",
            program: program,
        };
        // create (or select if one already exists) a stack that uses our inline program
        const stack = await automation_1.GitWorkspace.createOrSelectStack(inlineArgs);
        console.info("successfully initialized stack");
        console.info("installing plugins...");
        for (let [plugin, version] of Object.entries(package_json_1.pulumiPlugins)) {
            await stack.workspace.installPlugin(plugin, version);
        }
        console.info("plugins installed");
        const upRes = await stack.up({ onOutput: console.info, onEvent: (e) => console.warn(JSON.stringify(e)) });
    }
}
exports.GithubToAwsAuth = GithubToAwsAuth;
class Repo {
    static async up(repoName, { owner, collaborators }) {
        const program = async () => {
            const provider = new github.Provider("provider", {
                owner: owner,
            });
            const opts = { provider: provider };
            const repo = new github.Repository("source", {
                name: repoName,
                autoInit: true,
                description: "Created from pulumi automation api",
            }, opts);
            for (let [username, config] of Object.entries(collaborators)) {
                new github.RepositoryCollaborator(`collab-${username}`, {
                    permission: config.permission,
                    repository: repoName,
                    username: username,
                }, opts);
            }
            new github.RepositoryFile("push-action", {
                repository: repo.name,
                branch: defaultBranch,
                file: ".github/workflows/pr.yml",
                content: generateActionFile(Object.values(index_1.EnvVars)),
            }, opts);
        };
        const inlineArgs = {
            stackName: `github-repo-${repoName}`,
            projectName: "myles-hackathon",
            program: program,
        };
        // create (or select if one already exists) a stack that uses our inline program
        const stack = await automation_1.GitWorkspace.createOrSelectStack(inlineArgs);
        console.info("successfully initialized stack");
        console.info("installing plugins...");
        for (let [plugin, version] of Object.entries(package_json_1.pulumiPlugins)) {
            await stack.workspace.installPlugin(plugin, version);
        }
        console.info("plugins installed");
        const upRes = await stack.up({ onOutput: console.info, onEvent: (e) => console.warn(JSON.stringify(e)) });
    }
}
exports.Repo = Repo;
class Branch {
    static async up(branchName, args) {
        const { owner, repoName, whoami } = args;
        const program = async () => {
            const provider = new github.Provider("provider", {
                owner: owner,
            });
            const opts = { provider: provider };
            const user = await github.getUser({
                // Retrieve information about the currently authenticated user.
                username: "",
            });
            const repoEnv = new github.RepositoryEnvironment("repo-env", {
                environment: branchName,
                repository: repoName,
                reviewers: [{
                        users: [parseInt(user.id)]
                    }]
            });
            const pulumiToken = new pulumiservice.AccessToken("pulumiToken", {
                description: pulumi.interpolate `token for branch ${owner}/${repoName}/${branchName}`
            });
            const patSecret = new github.ActionsEnvironmentSecret("source-access-token", {
                repository: repoName,
                environment: repoEnv.environment,
                secretName: index_1.EnvVars.PULUMI_ACCESS_TOKEN,
                plaintextValue: pulumi.interpolate `${pulumiToken.value}`,
            }, opts);
            const stackNameSecret = new github.ActionsEnvironmentSecret("stack-name-secret", {
                repository: repoName,
                environment: repoEnv.environment,
                secretName: index_1.EnvVars.PULUMI_STACK_NAME,
                plaintextValue: branchName,
            }, opts);
            const whoamiSecret = new github.ActionsEnvironmentSecret("whoami-secret", {
                repository: repoName,
                environment: repoEnv.environment,
                secretName: index_1.EnvVars.WHO_AM_I,
                plaintextValue: whoami,
            });
        };
        const inlineArgs = {
            stackName: `gh-branch-${branchName}`,
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
    }
}
exports.Branch = Branch;
function toSecretStr(str) {
    return "${{ secrets." + str + " }}";
}
function generateActionFile(secrets) {
    // Convert ["PULUMI_ACCESS_TOKEN", "PULUMI_STACK_NAME", "ROLE_ARN"] 
    // into { "PULUMI_ACCESS_TOKEN": "{{ .secrets.PULUMI_ACCESS_TOKEN }}", etc... }
    const env = secrets.reduce((prev, secret) => {
        return {
            [secret]: toSecretStr(secret),
            ...prev,
        };
    }, {});
    return yaml.dump({
        "name": "Run Pulumi Up",
        "on": {
            "push": {
                "branches": [
                    defaultBranch,
                ]
            }
        },
        "permissions": {
            "id-token": "write",
            "contents": "read"
        },
        "env": env,
        "jobs": {
            "update": {
                "name": "Update",
                "runs-on": "ubuntu-latest",
                "steps": [
                    {
                        "uses": "actions/checkout@v2"
                    },
                    {
                        "name": "Install Pulumi CLI",
                        "uses": "pulumi/setup-pulumi@v2",
                    },
                    {
                        "name": "configure aws credentials",
                        "uses": "aws-actions/configure-aws-credentials@master",
                        "with": {
                            "role-to-assume": toSecretStr(index_1.EnvVars.ROLE_ARN),
                            "role-session-name": "githubactions",
                            "aws-region": "us-west-2"
                        },
                    },
                    {
                        "name": "Check permissions",
                        "run": "aws sts get-caller-identity\n"
                    },
                    {
                        "uses": "pulumi/actions@v3",
                        "env": env,
                        "with": {
                            "command": "up",
                            "stack-name": toSecretStr(index_1.EnvVars.PULUMI_STACK_NAME),
                        }
                    }
                ]
            }
        }
    }, { noRefs: true });
}
//# sourceMappingURL=repo.js.map