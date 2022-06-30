import { MongoClient } from "mongodb";
export declare class DocDb {
    static up(stackName: string): Promise<MongoClient>;
}
export declare class LocalDockerMongo {
    static up(stackName: string): Promise<MongoClient>;
}
