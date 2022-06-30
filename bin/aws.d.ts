export declare type GithubToAwsAuthProps = {
    repoName: string;
    repoOwner: string;
};
export declare class Ec2AsgLb {
    static up({ repoName, repoOwner }: GithubToAwsAuthProps): Promise<void>;
}
