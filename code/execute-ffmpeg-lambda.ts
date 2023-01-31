import { FFMPEGCommand, executeFfmpeg } from "./execute-ffmpeg";

export type FFMPEGEvent = { Records: FFMPEGCommand[] };

export type FFMPEGResult = { Records: { error?: Error }[] };

export async function handler(event: FFMPEGEvent): Promise<FFMPEGResult> {
  const results = await Promise.all(
    event.Records.map<PromiseLike<{ error?: Error }>>(async (record) => {
      try {
        await executeFfmpeg(record);
        return {};
      } catch (e) {
        console.log("error ==>", e);
        return { error: e as Error };
      }
    })
  );
  return {
    Records: results,
  };
}