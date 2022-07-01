import type { Apps, collaborators } from './index';
import { Branch } from "./repo";
import { DocDb, LocalDockerMongo } from "./mongo";
import { ApiGwServer } from './server';


export function laptopApps(repoOwner: string, repoName: string, users: typeof collaborators): Apps {
    return Object.keys(users).reduce((prev, user) => {
        return {
            [`${user}-laptop`]: {
                bootstraps: [
                    // when we run locally, ensure that github actions is up to date
                    async () => await Branch.up(user, { owner: repoOwner, repoName: repoName, whoami: `github-actions-${user}` }),
                ],
                // make sure that mongo is up and running
                mongo: async () => await LocalDockerMongo.up(`local-mongo`),
            },
            ...prev
        };
    }, {});
}

export function githubActionApps(envs: string[]): Apps {
    return envs.reduce((prev, env) => {
        return {
            [`github-actions-${env}`]: {
                bootstraps: [
                    async () => {
                        const outputs = await DocDb.up(env)
                        await ApiGwServer.up(env, outputs)
                    }
                ],
                // github actions are CI/CD processes, so they should just bootstrap then exit
                bailAfterBootstrap: true,
            },
            ...prev
        };
    }, {});
}

/**
 * It'd be cool if we could arbitrarily nest a "stack" into something like a "folder"
 *
 * Like:
 *
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