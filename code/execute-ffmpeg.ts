import { exec, ExecOptions } from "child_process";
import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync } from "fs";
import { basename, dirname } from "path";
import { promisify } from "util";
import {S3} from 'aws-sdk';
import { IncomingMessage, request as httpRequest}  from 'http';
import { request as httpsRequest}  from 'https';

const tempDir = existsSync('/tmp') ? '/tmp' : './tmp';
const ffmpegPath = existsSync('/opt/ffmpeg') ? '/opt/ffmpeg' : 'ffmpeg';

type S3FileInfo = {
  Bucket: string;
  Key: string;
  input: boolean;
  output: boolean;
};

type UrlFileInfo =  {
  url: string;
  input: boolean;
  output: boolean;
}

type S3FileLocalInfo = S3FileInfo & { local: string };
type UrlFileLocalInfo = UrlFileInfo & { local: string };

export interface FFMPEGCommand {
  command: string;
  fileMapping: Record<string, S3FileInfo | UrlFileInfo>;
}

const s3Client = new S3();

function run(command: string, options?: ExecOptions) {
  return promisify(exec)(command.replace(/^ffmpeg/, ffmpegPath), options);
}

function toSafeFileName(name: string): string {
  return name.replace(/[^a-z0-9\.]/gi, "-");
}

async function createInputStream(file: S3FileInfo | UrlFileInfo){
  const url = (file as UrlFileInfo).url;
  if(url){
    return new Promise<IncomingMessage>((resolve, reject)=> {
      const request = url.startsWith('https://') ?  httpsRequest : httpRequest;
      const req  = request(url, response => resolve(response))
      req.end();
    })
  }
  const { Bucket, Key } = file as  S3FileLocalInfo
  return s3Client.getObject({
    Bucket,
    Key
  }).createReadStream();
}

async function downloadFile(file: (S3FileLocalInfo | UrlFileLocalInfo)){
  const localDir = dirname(file.local);
  if (!existsSync(localDir)){
    mkdirSync(localDir, {recursive: true});
  }
  const stream = await createInputStream(file);
  return new Promise((resolve, reject) => {
    stream.pipe(createWriteStream(file.local))
      .on('close', resolve)
      .on('error', reject);
    }
  );
}


async function uploadFile(file: (S3FileLocalInfo | UrlFileLocalInfo)){
  const stream = createReadStream(file.local);
  const url = (file as UrlFileInfo).url;
  if(url){
    const request = url.startsWith('https://') ?  httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
      stream.pipe(request(url, { method: "PUT" }))
        .on('close', resolve)
        .on('error', reject);
      }
    );
  }

  const { Bucket, Key } = file as  S3FileInfo
  return s3Client.putObject({
    Bucket,
    Key,
    Body: stream
  }).promise();
}

function getFileName(file: S3FileInfo | UrlFileInfo){
  return basename((file as S3FileInfo).Key || (file as UrlFileInfo).url)
}

export async function executeFfmpeg({
  command: commandWithPlaceHolders,
  fileMapping,
}: FFMPEGCommand) {
  const extendedFileMapping = Object.entries(fileMapping).reduce(
    (acc, [placeHolder, value], i) => ({
      ...acc,
      [placeHolder]: {
        ...value,
        local: `${tempDir}/${i}/${toSafeFileName(getFileName(value))}`,
      },
    }),
    {} as Record<string, S3FileLocalInfo | UrlFileLocalInfo>
  );
  
  Object.values(extendedFileMapping)
    .forEach(({ local }) => existsSync(local) && unlinkSync(local));

  const commandWithLocalFiles = commandWithPlaceHolders.replace(
    /\{\{([^}]+)\}\}/gi,
    (placeHolder: string) => extendedFileMapping[placeHolder].local
  );
  console.log('command ==>', commandWithLocalFiles);

  const downloads = Object.values(extendedFileMapping).map((file) =>
    file.input ? downloadFile(file) : undefined
  );

  console.log('downloading', downloads.filter((d) => !!d).length, 'files...');
  await Promise.all(downloads);
  console.log('downloaded files');

  Object.values(extendedFileMapping).forEach((file) => {
    if (!file.output) return;
    const localDir = dirname(file.local);
    if (!existsSync(localDir)) mkdirSync(localDir, {recursive: true});
  });
  
  await run(commandWithLocalFiles);

  const uploads = Object.values(extendedFileMapping).map((file) =>
    file.output ? uploadFile(file) : undefined
  );

  console.log('uploading', uploads.filter((u) => !!u).length, 'files...');
  await Promise.all(uploads);
  console.log('uploaded files');
}