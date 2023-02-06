import {
  CfnOutput,
    Duration,
    Stack,
    StackProps,
  } from "aws-cdk-lib";
import { LayerVersion, Runtime, Code, Function, InlineCode } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export default class CodygoAwsFfmpegStack extends Stack {
    constructor(
      scope: Construct,
      id: string,
      props?: StackProps
    ) {
        super(scope, id, props);

        const layer = new LayerVersion(
          this,
          "CodygoAwsFfmpegLayer",
          {
            layerVersionName: "CodygoAwsFfmpegLayer",
            code: Code.fromAsset(__dirname + '/../dist/layer.zip'),
          }
        );


        const lambda = new Function(this, 'CodygoAwsFfmpegLambda', {
          functionName: 'CodygoAwsFfmpegLambda',
          layers: [layer],
          memorySize: 2048,
          timeout: Duration.minutes(3),
          runtime: Runtime.NODEJS_16_X,
          handler: 'index.handler',
          environment: {
            NODE_OPTIONS: '--enable-source-maps',
          },
          code: new InlineCode(`
            const {handler} = require('/opt/execute-ffmpeg-lambda');
            exports.handler = handler;
          `)
        });


        new CfnOutput(this, 'CodygoAwsFfmpegLayerArn', {value: layer.layerVersionArn});
        new CfnOutput(this, 'CodygoAwsFfmpegLambdaArn', {value: lambda.functionArn});



    }
}