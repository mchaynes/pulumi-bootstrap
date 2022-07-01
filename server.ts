import express from 'express';
import { MongoClient, ObjectId } from "mongodb";
import * as awsx from '@pulumi/awsx'
import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { formatMongoUrl, MongoUpOutputs } from './mongo';
import { Pulumi } from './pulumi';
import bp from 'body-parser'


type Request = {
    headers: Record<string, string> 
    body: any 
    params: Record<string, string>
}

type Response = {
    statusCode: number 
    body: any
}


type Handler = {
    method: string
    path: string
    handler: (req: Request) => Promise<Response>
}

type Routes = {
    [path: string]: {
        [method: string]: (req: Request) => Promise<Response>
    }
}

type User = {
    first: string;
    last: string;
};


export class Server {
    static routes(getClient: () => Promise<MongoClient>): Routes {
        return {
            "/": {
                "GET": async (req) => {
                    return {
                        statusCode: 200,
                        body: "hello!",
                    } 
                }
            },
            "/users": {
                "GET": async (req) => {
                    const mongoClient = await getClient()
                    const users = mongoClient.db("db").collection("users")

                    try {
                        const id = req.params["id"];
                        if (!id) return {
                            statusCode: 400,
                            body: "id must be set",
                        };
 
                        const result = await users.findOne({
                            _id: new ObjectId(id),
                        });

                        if (!result) {
                            return {
                                statusCode: 404,
                                body: "not found",
                            }
                        }

                        return {
                            statusCode: 200,
                            body: result,
                        }
                    } catch (e) {
                        return {
                            statusCode: 500,
                            body: e
                        }
                    }

                },
                "POST": async (req) => {
                    const mongoClient = await getClient()
                    const users = mongoClient.db("db").collection("users")
                    try {
                        const user: User = req.body;
                        const result = await users.insertOne({
                            ...user,
                        });
                        return {
                            statusCode: 200,
                            body: {
                                id: result.insertedId
                            }
                        }
                    } catch(e) {
                        return {
                            statusCode: 500,
                            body: {
                                // @ts-ignore
                                error: e.toString(),
                                body: req.body,
                            },
                        }
                    }
                }
            }
        }
    }
}
export class ExpressServer {

    static async up(mongo: MongoClient) {

        const app = express()

        app.use(bp.json())
        app.use(bp.urlencoded({extended: true}))

        const routes = Server.routes(async () => mongo)

        for (let [path, methods] of Object.entries(routes)) {
            for (let [method, handler] of Object.entries(methods)) {
                switch(method) {
                    case "GET":
                        console.log(`${path}/${method}`)
                        app.get(path, async (req, res) => {
                            const response = await handler({
                                headers: req.headers as Record<string, string>,
                                params: req.query as Record<string, string>,
                                body: req.body,
                            })
                            res.status(response.statusCode)
                            res.send(response.body)
                        })
                        break
                    case "POST":
                        console.log(`${path}/${method}`)
                        app.post(path, async (req, res) => {
                            const response = await handler({
                                headers: req.headers as Record<string, string>,
                                params: req.query as Record<string, string>,
                                body: req.body,
                            })
                            res.status(response.statusCode)
                            res.send(response.body)
                        })
                        break
                }
            }
        }
        const port = 3000;
        console.log(`\n\nStarted service at: http://localhost:${port}\n\n`);
        app.listen(port);
    }
}

export type ApiGwOutput = {
    url: pulumi.Output<string> | string
}

export class ApiGwServer {
    static program(mongoConfig: MongoUpOutputs) {
        return async (): Promise<ApiGwOutput> => {
            const getMongo = async () => {
                return new MongoClient(formatMongoUrl(mongoConfig))
            }
            const routes = Server.routes(getMongo)
            const apiGwRoutes: awsx.apigateway.Route[] = []
            for (let [path, methods] of Object.entries(routes)) {
                for (let [method, handler] of Object.entries(methods)) {
                    switch(method) {
                        case "GET":
                            apiGwRoutes.push({
                                path: path,
                                method: method,
                                eventHandler: new aws.lambda.CallbackFunction(`${path.replace(/\//, "")}-${method}`, {
                                    memorySize: 256,
                                    callback: async (event: awsx.apigateway.Request)  => {
                                        const response = await handler({
                                            headers: event.headers as Record<string, string>,
                                            params: event.queryStringParameters as Record<string,string>,
                                            body: event.body ?? "",
                                        })
                                        return {
                                            statusCode: response.statusCode,
                                            body: response.body,
                                        }
                                    }
                                })
                            })
                    }
                }
            }
            const api = new awsx.apigateway.API("api", {
                routes: apiGwRoutes,
            })
            return {
                url: api.url,
            }
        }
    }
    static async up(stackName: string, mongoConfig: MongoUpOutputs): Promise<ApiGwOutput> {
        const output = await Pulumi.up<ApiGwOutput>(stackName, ApiGwServer.program(mongoConfig))
        console.log(JSON.stringify(output))
        return output
    }
}