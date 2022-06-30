import { Express } from 'express';
import { MongoClient } from "mongodb";
export declare class App {
    mongo: MongoClient;
    app: Express;
    constructor(mongo: MongoClient);
    start(): Promise<void>;
}
