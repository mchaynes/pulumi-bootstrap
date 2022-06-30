export declare class Repo {
    sshUrl: string;
    branch: string;
    private constructor();
    static up({ name, owner }: {
        name: string;
        owner?: string;
    }): Promise<Repo>;
}
export declare function up(owner: string, source: string, automation: string): Promise<void>;
