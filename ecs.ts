import * as awsx from '@pulumi/awsx';
import * as aws from '@pulumi/aws';

export class Ecs {
    static async up(stackName: string) {
        const program = async () => {
            const repository = new aws.ecr.Repository(
                `${stackName}-repo`,
                {
                    imageScanningConfiguration: { scanOnPush: true },
                },
            );
        };
    }
}