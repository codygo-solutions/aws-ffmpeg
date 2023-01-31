#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import CodygoAwsFfmpegStack from "./aws-ffmpeg-stack";

const app = new cdk.App();

new CodygoAwsFfmpegStack(app, "CodygoAwsFfmpegStack", {
  tags: {
    stage: process.env.STAGE || "dev",
  },
});