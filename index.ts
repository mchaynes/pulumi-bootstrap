import { GithubToAwsAuth, Repo } from './repo';
import { MongoClient } from 'mongodb';
import { ExpressServer } from './server';
import { githubActionApps, laptopApps as laptopApps } from './apps';
import { EnvVars } from './env'

/**
 * What is an app, really?
 * Does the definition of an "app" include its infrastructure as well?
 */
export type App = {
    /*
    * bootstraps are any actions that should run before the app starts up that the "live" app
    * doesn't directly depend on in the code.
    * Things like github branch setup, rewriting the readme, etc should all live there
    */
    bootstraps?: (() => Promise<any>)[];
    /**
     * Some apps aren't long for this world. These apps are typically "CI/CD" apps
     */
    bailAfterBootstrap?: boolean;

    // From here on out, all of this config is specific to the live running application.
    // These functions describe how to grab their various dependencies so that they can
    // be injected into the application

    /**
     * mongo function is responsible for getting a connection to a mongo server somehow
     */
    mongo?: () => Promise<MongoClient>;
};

export type Apps = {
    [stackName: string]: App;
};

/**
 * The pulumi providers we rely on install
 */
export const pulumiProviders = {
    "github": "v4.12.0",
    "pulumiservice": "v0.1.3",
    "aws": "v5.9.1",
};

export const projectName = "myles-hackathon";
const repoName = "source-repo";
const repoOwner = "mchaynes";

/**
 * Github Collaborators of on this app
 * They all get their own branch and deployment
 */
export const collaborators = {
    "mchaynes": { permission: "admin" },
    "EvanBoyle": { permission: "admin" },
    "stevesloka": { permission: "admin" },
    "djgrove": { permission: "admin" },
    "caseyyh": { permission: "admin" },
};

/**
 * The "live" environments
 */
export const environments = {
    "dev": {},
    "stage": {},
    "prod": {}
};

let apps: Apps = {
    // The "root" app is for operations that manage all of the other apps.
    // This app typically handles permission management.
    // Like giving a new user access, or giving an AWS account permissions to GitHub
    // Usually this app is ran manually by an admin, or in a "master" or "post-prod" branch
    "root": {
        bootstraps: [
            async () => {
                // ensure github repo is created, and that all collaborators have been added to repo
                await Repo.up(repoName, { owner: repoOwner, collaborators: collaborators });
                // initialize connection from github to aws
                await GithubToAwsAuth.up("dev", { repoName: repoName, repoOwner: repoOwner });
            }
        ],
        // root just grants or builds things then exits. It doesn't serve any live traffic
        bailAfterBootstrap: true,
    },
    // laptop apps run on a laptop
    ...laptopApps(repoOwner, repoName, collaborators),
    // apps that run in github actions
    ...githubActionApps([...Object.keys(collaborators), ...Object.keys(environments)]),
};


const run = async () => {

    // who am i? where am i running? what is my purpose?
    const whoami = process.env[EnvVars.WHOAMI];

    console.log(`Available App Names: [${Object.keys(apps).join(", ")}]`);

    if (!whoami) {
        throw new Error(`Please set ${EnvVars.WHOAMI} environment variable.`);
    }

    console.log(`Running as: ${whoami}`);

    if (!(whoami in apps)) {
        throw new Error(`You are ${whoami}, but you aren't a valid app. You probably need to add yourself to index.ts`);
    }

    // get config for this app
    const config = apps[whoami as keyof typeof apps];

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
        console.log(`\n\nI, ${whoami}, am bailing out after successful bootstrap\n\n`);
        process.exit(0);
    }

    if (!config.mongo) {
        throw new Error("this app's config doesn't have a mongo connection");
    }

    const mongoClient = await config.mongo();

    await ExpressServer.up(mongoClient);
};



run().catch(err => console.error(err));