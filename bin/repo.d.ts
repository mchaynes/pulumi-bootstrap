export declare type GithubToAwsAuthProps = {
    repoOwner: string;
    repoName: string;
};
export declare class GithubToAwsAuth {
    static up(stackName: string, { repoName, repoOwner }: GithubToAwsAuthProps): Promise<void>;
}
declare type RepoProps = {
    owner: string;
    collaborators: RepoCollaborators;
};
export declare type RepoCollaborators = {
    [key: string]: {
        permission: string;
    };
};
export declare class Repo {
    static up(repoName: string, { owner, collaborators }: RepoProps): Promise<void>;
}
declare type BranchProps = {
    owner: string;
    repoName: string;
    whoami: string;
};
export declare class Branch {
    static up(branchName: string, args: BranchProps): Promise<void>;
}
export {};
