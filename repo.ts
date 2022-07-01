import * as pulumi from '@pulumi/pulumi';
import * as github from '@pulumi/github';
import * as pulumiservice from '@pulumi/pulumiservice';
import * as aws from '@pulumi/aws';
import * as yaml from 'js-yaml';
import * as fs from 'fs'
import { Pulumi } from './pulumi';
import { EnvVars } from './env';
import { fstat } from 'fs';

export type GithubToAwsAuthProps = {
    repoOwner: string;
    repoName: string;
}

export class GithubToAwsAuth {
    static async up(stackName: string, { repoName, repoOwner }: GithubToAwsAuthProps) {
        await Pulumi.up(`github-aws-${stackName}`, async () => {
            const oidcHost = `token.actions.githubusercontent.com`;
            const oidcUrl = `https://${oidcHost}`;

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
                                    "token.actions.githubusercontent.com:sub":
                                        `repo:${repoOwner}/${repoName}:*`,
                                },
                            },
                            Principal: {
                                Federated: [oidcProvider.arn],
                            },
                        },
                    ],
                } as aws.iam.PolicyDocument,
            });

            const policy = new aws.iam.Policy("iam-policy", {
                name: "github-admin-policy",
                policy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [
                        {
                            "Effect": "Allow",
                            "Action": "*",
                            "Resource": "*"
                        }
                    ]
                }, null, 4)
            })

            new aws.iam.PolicyAttachment("access", {
                policyArn: policy.arn,
                roles: [role.name],
            });

            new github.ActionsSecret("roleArnSecret", {
                repository: repoName,
                secretName: EnvVars.ROLE_ARN,
                plaintextValue: pulumi.interpolate`${role.arn}`,
            });
        });
    }
}

type RepoProps = {
    owner: string;
    collaborators: RepoCollaborators;
};

export type RepoCollaborators = {
    [key: string]: {
        permission: string;
    };
}

export class Repo {
    static async up(repoName: string, { owner, collaborators }: RepoProps) {
        await Pulumi.up("github-repo", async () => {
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
                /*
                    All of this code exists because there is a bug in the github.RepositoryCollaborator
                    an extra "/" is appended in the middle of the PUT request so we get a 404 from github
                    TODO: file issue on this
                */
                const resp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/collaborators/${username}`, {
                    headers: {
                        // TODO: make this not hacky
                        Authorization: `token ${process.env["GITHUB_TOKEN"]}`,
                        Accept: 'application/vnd.github.v3+json'
                    },
                    method: "PUT",
                    body: JSON.stringify({
                        permission: config.permission,
                    })
                });
                // 2xx status code
                if (`${resp.status}`.startsWith("2")) {
                    console.log(`Added collaborator: ${username}`);
                } else {
                    console.error("Error adding collaborator: " + await resp.text());
                }
            }

        });
    }
}

type BranchProps = {
    owner: string;
    repoName: string;
    whoami: string;
};

export class Branch {

    static program(branchName: string, args: BranchProps) {
        const { owner, repoName, whoami } = args;
        return async () => {
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
            });

            const pulumiToken = new pulumiservice.AccessToken("pulumiToken", {
                description: pulumi.interpolate`token for branch ${owner}/${repoName}/${branchName}`
            });

            new github.ActionsEnvironmentSecret("source-access-token", {
                repository: repoName,
                environment: repoEnv.environment,
                secretName: EnvVars.PULUMI_ACCESS_TOKEN,
                plaintextValue: pulumi.interpolate`${pulumiToken.value}`,
            }, opts);

            new github.ActionsEnvironmentSecret("stack-name-secret", {
                repository: repoName,
                environment: repoEnv.environment,
                secretName: EnvVars.PULUMI_STACK_NAME,
                plaintextValue: branchName,
            }, opts);

            const actionFileContents = generateActionFile(whoami, branchName, Object.values(EnvVars))

            fs.writeFileSync(`.github/workflows/${branchName}.yml`, actionFileContents)
        };
    }

    static async up(branchName: string, args: BranchProps) {
        await Pulumi.up(`gh-branch-${branchName}`, Branch.program(branchName, args))
    }
}

function toSecretStr(str: string) {
    return "${{ secrets." + str + " }}";
}

function generateActionFile(whoami:string, branchName: string, secrets: string[]) {
    // Convert ["PULUMI_ACCESS_TOKEN", "PULUMI_STACK_NAME", "ROLE_ARN"] 
    // into { "PULUMI_ACCESS_TOKEN": "{{ .secrets.PULUMI_ACCESS_TOKEN }}", etc... }
    const env = secrets.reduce((prev, secret) => {
        return {
            [secret]: toSecretStr(secret),
            ...prev,
        };
    }, {});

    return yaml.dump({
        "name": "Deploy app",
        "on": {
            "push": {
                "branches": [
                    branchName,
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
                "environment": branchName,
                "name": "Update",
                "runs-on": "ubuntu-latest",
                "steps": [
                    {
                        uses: "actions/checkout@v2"
                    },
                    {
                        name: "Install Pulumi CLI",
                        uses: "pulumi/setup-pulumi@v2",
                    },
                    {
                        name: "configure aws credentials",
                        uses: "aws-actions/configure-aws-credentials@master",
                        with: {
                            "role-to-assume": toSecretStr(EnvVars.ROLE_ARN),
                            "role-session-name": "githubactions",
                            "aws-region": "us-west-2"
                        },
                    },
                    {
                        name: "setup node",
                        uses: "actions/setup-node@v3",
                        with: {
                            "node-version": "18"
                        }
                    },
                    {
                        name: "start app",
                        run: "yarn && yarn run tsc && yarn node ./bin/index.js",
                        env: {
                            [EnvVars.WHOAMI]: whoami,
                        }
                    }
                ]
            }
        }
    }, { noRefs: true });
}

