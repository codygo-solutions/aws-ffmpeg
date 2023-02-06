import { exec, ExecOptions } from "child_process";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  fstat,
  mkdirSync,
  unlinkSync,
} from "fs";
import { basename, dirname } from "path";
import { promisify } from "util";
import { S3 } from "aws-sdk";
import { IncomingMessage, request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { rm, stat } from "fs/promises";
import { FieldLogLevel } from "aws-cdk-lib/aws-appsync";

const tempDir = existsSync("/tmp") ? "/tmp" : "./tmp";
const ffmpegPath = existsSync("/opt/ffmpeg") ? "/opt/ffmpeg" : "ffmpeg";

export type S3Location = {
  Bucket: string;
  Key: string;
};

export type UrlLocation = {
  url: string;
  method?: string;
};

export type RemoteFileInfo = {
  location: S3Location | UrlLocation;
  input?: boolean;
  output?: boolean;
};

export interface FFMPEGCommand {
  command: string;
  fileMapping: Record<string, RemoteFileInfo>;
}

type RemoteAndLocalFileInfo = RemoteFileInfo & { local: string };

const s3Client = new S3();

function run(command: string, options?: ExecOptions) {
  return promisify(exec)(command.replace(/^ffmpeg/, ffmpegPath), options);
}

function toSafeFileName(name: string): string {
  return name.replace(/[^a-z0-9\.]/gi, "-");
}

async function createInputStream(file: RemoteFileInfo) {
  const url = (file.location as UrlLocation).url;
  if (url) {
    return new Promise<IncomingMessage>((resolve, reject) => {
      const request = url.startsWith("https://") ? httpsRequest : httpRequest;
      const req = request(url, (response) => resolve(response));
      req.end();
    });
  }
  const { Bucket, Key } = file.location as S3Location;
  return s3Client
    .getObject({
      Bucket,
      Key,
    })
    .createReadStream();
}

async function downloadFile(file: RemoteAndLocalFileInfo) {
  const localDir = dirname(file.local);
  if (!existsSync(localDir)) {
    mkdirSync(localDir, { recursive: true });
  }
  const stream = await createInputStream(file);
  return new Promise((resolve, reject) => {
    stream
      .pipe(createWriteStream(file.local))
      .on("close", resolve)
      .on("error", reject);
  });
}

async function uploadFile(file: RemoteAndLocalFileInfo) {
  const stream = createReadStream(file.local);
  const { Bucket, Key } = file.location as S3Location;
  if (Key) {
    return s3Client
      .putObject({
        Bucket,
        Key,
        Body: stream,
      })
      .promise();
  }

  const location = file.location as UrlLocation;
  const url = location.url;
  const method = location.method || "PUT";
  const request = url.startsWith("https://") ? httpsRequest : httpRequest;
  const size = (await stat(file.local)).size;

  return new Promise((resolve, reject) => {
    stream
      .pipe(
        request(url, { method, headers: { "Content-Length": size } }, (res) => {
          console.log("STATUS:", res.statusCode);
          console.log("HEADERS:", JSON.stringify(res.headers));
          res.setEncoding("utf8");
          res.on("data", function (chunk) {
            console.log("Response chunk:", chunk);
          });
          res.on("end", function () {
            console.log("Request End");
          });
        })
      )
      .on("close", resolve)
      .on("error", reject);
  });
}

function getFileName(file: RemoteFileInfo) {
  const location = file.location;
  return basename(
    (location as S3Location).Key || (location as UrlLocation).url
  );
}

export async function executeFfmpeg({
  command: commandWithPlaceHolders,
  fileMapping,
}: FFMPEGCommand) {

  console.log(commandWithPlaceHolders, fileMapping);
  
  const extendedFileMapping = Object.entries(fileMapping).reduce(
    (acc, [placeHolder, value], i) => ({
      ...acc,
      [placeHolder]: {
        ...value,
        local: `${tempDir}/${i}_${Date.now()}/${toSafeFileName(
          getFileName(value)
        )}`,
      },
    }),
    {} as Record<string, RemoteAndLocalFileInfo>
  );

  Object.values(extendedFileMapping).forEach(
    ({ local }) => existsSync(local) && unlinkSync(local)
  );

  const commandWithLocalFiles = commandWithPlaceHolders.replace(
    /\{\{([^}]+)\}\}/gi,
    (_, placeHolder: string) => {
      return extendedFileMapping[placeHolder].local;
    }
  );
  console.log("command ==>", commandWithLocalFiles);

  const downloads = Object.values(extendedFileMapping).map((file) =>
    file.input ? downloadFile(file) : undefined
  );

  console.log("downloading", downloads.filter((d) => !!d).length, "files...");
  await Promise.all(downloads);
  console.log("downloaded files");

  Object.values(extendedFileMapping).forEach((file) => {
    if (!file.output) return;
    const localDir = dirname(file.local);
    if (!existsSync(localDir)) mkdirSync(localDir, { recursive: true });
  });

  await run(commandWithLocalFiles);

  const uploads = Object.values(extendedFileMapping).map((file) =>
    file.output ? uploadFile(file) : undefined
  );

  console.log("uploading", uploads.filter((u) => !!u).length, "files...");
  await Promise.all(uploads);
  console.log("uploaded files");

  console.log("deleting local files");
  await Promise.all(
    Object.values(extendedFileMapping).map((f) =>
      rm(f.local).catch((e) =>
        console.log(`ignored ${f.local} deletion failure`)
      )
    )
  );
}
