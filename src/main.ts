import * as core from '@actions/core';
import * as fs from 'fs';
import { ToolRunner } from "@actions/exec/lib/toolrunner";
import { ExecOptions } from '@actions/exec/lib/interfaces';
import * as Stream from 'stream';
const download = require('download');

async function downloadKlar() {
    const klarUrl = "https://github.com/optiopay/klar/releases/download/v2.4.0/klar-2.4.0-linux-amd64";
    const klarDownloadDir = `${process.env['GITHUB_WORKSPACE']}/_temp/tools`;
    return download(klarUrl, klarDownloadDir, { extract: true }).then(() => {
        const klarDownloadPath = `${klarDownloadDir}/klar-2.4.0-linux-amd64`;
        fs.chmodSync(klarDownloadPath, '777');
        return klarDownloadPath;
    })
}

async function run() {
  try {
    const klarDownloadPath = await downloadKlar();
    console.log("klarDownloadPath: ", klarDownloadPath);
    const imageToScan = core.getInput('image-to-scan');
    console.log("Scanning image: ", imageToScan);
    let error = "";
    let output = "";
    // let stdErrStream = new Stream.Writable();
    // let stdOutStream = new Stream.Writable();

    // stdErrStream.on('data', (data: string) => {
    //   error += data;
    // });

    // stdOutStream.on('data', (data: string) => {
    //   output += data;
    // });

    const options: ExecOptions = {
      env: {
        'CLAIR_ADDR': 'localhost:6060',
      },
      // errStream: stdErrStream,
      // outStream: stdOutStream,
      ignoreReturnCode: true
    };

    const whitelistFile = core.getInput('whitelist-file');
    if (whitelistFile) {
      options.env['WHITELIST_FILE'] = whitelistFile;
    }

    const toolRunner = new ToolRunner(klarDownloadPath, [ imageToScan ], options);
    const code = await toolRunner.exec();
    
    if (code == 0) {
      console.log('Found 0 vulnerabilities');
    }
    else if (code == 1) {
      console.log('Found vulnerabilities: ');
      console.log('stderr: ', error);
      console.log('stdout: ', output);
      // throw new Error('Found vulnerabilities');
    }
    else {
      throw new Error('An error occured while scanning the image for vulnerabilities.');
    }
    // const nameToGreet = core.getInput('who-to-greet');
    // if (nameToGreet == 'Octocat') {
    //     // the Octocat doesn't want to be greeted here!
    //     throw new Error("No Octocat greetings, please.");
    // } else {
    //     console.log(`Hello ${nameToGreet}!`);
    //     const time = (new Date()).toTimeString();
    //     core.setOutput("time", time);
    // }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run().then()
.catch(error => core.setFailed(error.message));