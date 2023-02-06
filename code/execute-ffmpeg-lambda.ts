import { FFMPEGCommand, executeFfmpeg } from "./execute-ffmpeg";

export type FFMPEGEvent = { Records: FFMPEGCommand[] };

export type FFMPEGResult = { Records: { error?: Error }[] };

export async function handler(event: FFMPEGEvent): Promise<FFMPEGResult> {
  const results = await Promise.all(
    event.Records.map<PromiseLike<{ error?: Error }>>(async (record) => {
      try {
        await executeFfmpeg(record);
        return { error: undefined };
      } catch (e) {
        console.log("error ==>", (e as Error).message);
        return { error: e as Error };
      }
    })
  );
  return {
    Records: results,
  };
}