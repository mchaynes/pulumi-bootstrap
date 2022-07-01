import * as awsx from '@pulumi/awsx';
import * as aws from '@pulumi/aws';
import { Pulumi } from './pulumi';

export class Ecs {
    static program(stackName: string) {
        return async () => {
            const repository = new aws.ecr.Repository(
                `${stackName}-repo`,
                {
                    imageScanningConfiguration: { scanOnPush: true },
                },
            );
        }
    }
    static async up(stackName: string) {
        Pulumi.up(stackName, Ecs.program(stackName))
    }
}