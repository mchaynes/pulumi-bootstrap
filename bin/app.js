"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.App = void 0;
const express_1 = __importDefault(require("express"));
const mongodb_1 = require("mongodb");
class App {
    constructor(mongo) {
        this.mongo = mongo;
        this.app = (0, express_1.default)();
    }
    async start() {
        const db = await this.mongo.db("db");
        const users = await db.collection("users");
        this.app.post("/users", async (req, res) => {
            try {
                const user = req.body;
                const result = await users.insertOne({
                    ...user,
                });
                res.send({
                    id: result.insertedId,
                });
            }
            catch (e) {
                res.send(e);
            }
        });
        this.app.get("/users", async (req, res) => {
            try {
                const id = req.query["id"]?.toString();
                if (!id)
                    return res.send({ error: "id must be set" });
                const result = await users.findOne({
                    _id: new mongodb_1.ObjectId(id)
                });
                if (!result) {
                    res.status(404);
                    res.send("not found");
                }
                return res.send(result);
            }
            catch (e) {
                return res.send(e);
            }
        });
        this.app.listen(3000);
    }
}
exports.App = App;
//# sourceMappingURL=app.js.map