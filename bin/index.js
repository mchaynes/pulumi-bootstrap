"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.environments = exports.collaborators = exports.EnvVars = void 0;
const repo_1 = require("./repo");
const mongo_1 = require("./mongo");
const mongodb_1 = require("mongodb");
const ecs_1 = require("./ecs");
const app_1 = require("./app");
var EnvVars;
(function (EnvVars) {
    EnvVars["PULUMI_ACCESS_TOKEN"] = "PULUMI_ACCESS_TOKEN";
    EnvVars["PULUMI_STACK_NAME"] = "PULUMI_STACK_NAME";
    EnvVars["GITHUB_TOKEN"] = "GITHUB_TOKEN";
    EnvVars["ROLE_ARN"] = "ROLE_ARN";
    EnvVars["WHO_AM_I"] = "WHO_AM_I";
    EnvVars["PORT"] = "PORT";
    EnvVars["HOST"] = "HOST";
    EnvVars["MONGO_CONN_STRING"] = "MONGO_CLIENT_URL";
})(EnvVars = exports.EnvVars || (exports.EnvVars = {}));
const repoName = "source-repo";
const repoOwner = "mchaynes";
exports.collaborators = {
    "mchaynes": { permission: "admin" },
    "EvanBoyle": { permission: "admin" },
    "stevesloka": { permission: "admin" },
    "djgrove": { permission: "admin" },
    "caseyyh": { permission: "admin" },
};
exports.environments = {
    "dev": {},
    "stage": {},
    "prod": {}
};
/**
 * It'd be cool if we could arbitrarily nest "stack" names in a way that feels natural with this approach
 *  acmecorp/todo-app/myles/laptop/mongo
 *  acmecorp/todo-app/myles/source/repo
 *  acmecorp/todo-app/dev/github/repo
 *  acmecorp/todo-app/dev/aws/mongo
 *
 *  acmecorp/todo-app/stage/github/repo
 *  acmecorp/todo-app/stage/aws/us-west-2/ecs-and-lb
 *  acmecorp/todo-app/stage/aws/us-west-2/mongo
 *
 *  acmecorp/todo-app/prod/github/repo
 *  acmecorp/todo-app/prod/aws/us-west-2/ecs-and-lb
 *  acmecorp/todo-app/prod/aws/us-west-2/mongo
 *  acmecorp/todo-app/prod/aws/us-east-1/ecs-and-lb
 *  acmecorp/todo-app/prod/aws/us-east-1/mongo
 *  acmecorp/todo-app/prod/aws/eu-west-1/ecs-and-lb
 *  acmecorp/todo-app/prod/aws/eu-west-1/mongo
 */
// convert collaborators into local stacks 
const localStacks = Object.keys(exports.collaborators).reduce((prev, collab) => {
    return {
        [`${collab}-local`]: {
            // local stack configures the remote github branch
            bootstraps: [
                async () => await repo_1.Branch.up(collab, { owner: repoOwner, repoName: repoName, whoami: `github-actions-${collab}` }),
            ],
            // when running, we want to 
            mongo: async () => await mongo_1.LocalDockerMongo.up(collab),
        },
        ...prev
    };
}, {});
// convert collaborators and environments into github-actions stacks.
// each collaborator and each environment gets a branch
const githubActionStacks = [...Object.keys(exports.collaborators), ...Object.keys(exports.environments)].reduce((prev, env) => {
    return {
        [`github-actions-${env}`]: {
            bootstraps: [
                async () => await mongo_1.DocDb.up(env),
                async () => await ecs_1.Ecs.up(env),
            ],
            // github actions are CI/CD processes, so they should just bootstrap then exit
            bailAfterBootstrap: true,
        },
        ...prev
    };
}, {});
const environmentStacks = Object.keys(exports.environments).reduce((prev, env) => {
    return {
        [env]: {
            mongo: async () => {
                const client = new mongodb_1.MongoClient(process.env[EnvVars.MONGO_CONN_STRING]);
                await client.connect();
                return client;
            }
        }
    };
}, {});
let stacks = {
    // The "root" stack is for operations that manage all of the other stacks.
    // These are one-time set up actions. One time as in "we need an admin to do this". 
    // Like giving a new user access, or giving an AWS account permissions to GitHub
    "root": {
        bootstraps: [
            async () => {
                await repo_1.Repo.up(repoName, { owner: repoOwner, collaborators: exports.collaborators });
                for (let env of Object.keys(exports.environments)) {
                    await repo_1.GithubToAwsAuth.up(env, { repoName: repoName, repoOwner: repoOwner });
                }
            }
        ],
        // root just grants or builds things then exits. It doesn't serve any live traffic
        bailAfterBootstrap: true,
    },
    ...localStacks,
    ...githubActionStacks
};
const run = async () => {
    // who am i? where am i running? what is my purpose?
    const whoami = process.env[EnvVars.WHO_AM_I];
    console.log(`Running as: ${whoami}`);
    if (!(whoami in stacks)) {
        throw new Error("Please add yourself above and set the WHOAMI environment variable");
    }
    // get config for this stack
    const config = stacks[whoami]; // yucky yucky
    // init any "bootstrap" actions
    // "bootstraps" are any functions that should run that the "live" application doesn't depend on. 
    // basically: go do some work to make sure something is set up that we don't directly reference
    // in this application.
    // for CI/CD runs, this is the only thing we actually execute
    if (config.bootstraps) {
        for (let bootstrap of config.bootstraps) {
            await bootstrap();
        }
    }
    if (config.bailAfterBootstrap) {
        console.log(`stack ${whoami} out after successful bootstrap`);
        process.exit(0);
    }
    if (!config.mongo) {
        throw new Error("this stack should either have mongo configured or bail out earlier");
    }
    const mongoClient = await config.mongo();
    const app = new app_1.App(mongoClient);
    await app.start();
};
run().catch(err => console.error(err));
//# sourceMappingURL=index.js.map