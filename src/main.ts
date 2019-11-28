import * as core from '@actions/core';
const download = require('download');
import * as fs from 'fs';

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