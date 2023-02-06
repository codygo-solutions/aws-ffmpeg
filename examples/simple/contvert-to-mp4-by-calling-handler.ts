import {handler} from '../../code/execute-ffmpeg-lambda'

const event = {
    "Records": [
      {
        "command": "ffmpeg -i {{input}} {{output}}",
        "fileMapping": {
          "input": {
            "input": true,
            "location": {
              "url": "https://s3.eu-central-1.amazonaws.com/dev-temp-uploads-app.faythefairy.io/codygo+site.mov"
            }
          },
          // "output": {
          //   "output": true,
          //   "location": {
          //     "Bucket": "dev-temp-uploads-app.faythefairy.io",
          //     "Key": "codygo+site.mp4"
          //   }
          // }
          "output": {
            "output": true,
            "location": {
              "url": "https://s3.eu-central-1.amazonaws.com/dev-temp-uploads-app.faythefairy.io/codygo+site2.mp4"
            }
          }
        }
      }
    ]
  }
  
handler(event).then(console.log).catch(e => console.dir(e, {depth: 5}))