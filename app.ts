import { timeStamp } from 'console';
import { randomUUID } from 'crypto';
import express, { Express } from 'express';
import { Db, MongoClient, ObjectId } from "mongodb";

export class App {
    mongo: MongoClient;
    app: Express;
    constructor(mongo: MongoClient) {
        this.mongo = mongo;
        this.app = express();
    }

    async start() {
        const db = await this.mongo.db("db");
        const users = await db.collection("users");
        type User = {
            first: string;
            last: string;
        };
        this.app.post("/users", async (req, res) => {
            try {
                const user: User = req.body;
                const result = await users.insertOne({
                    ...user,
                });
                res.send({

                    id: result.insertedId,
                });
            } catch (e) {
                res.send(e);
            }
        });
        this.app.get("/users", async (req, res) => {
            try {
                const id = req.query["id"]?.toString();
                if (!id) return res.send({ error: "id must be set" });

                const result = await users.findOne({
                    _id: new ObjectId(id)
                });

                if (!result) {
                    res.status(404);
                    res.send("not found");
                }

                return res.send(result);
            } catch (e) {
                return res.send(e);
            }
        });
        this.app.listen(3000);
    }
}