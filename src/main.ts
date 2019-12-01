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

async function downloadWhiteListFile(branch: string, path: string, token: string) {
  const whitelistFileUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/${branch}/${path}`;
  const parts = path.split('/');
  const whitelistFileName = parts[parts.length-1];
  const whitelistFileDownloadDir = `${process.env['GITHUB_WORKSPACE']}/_temp/containerscan`;
  console.log('whitelistFileUrl: ', whitelistFileUrl);
  console.log('whitelistFileName: ', whitelistFileName);
  console.log('whitelistFileDownloadDir: ', whitelistFileDownloadDir);
  console.log('token: ', token);
  return download(whitelistFileUrl, whitelistFileDownloadDir, { headers: { Authorization: `token ${token}` } }).then(() => {
    return `${whitelistFileDownloadDir}/${whitelistFileName}`;
  })
}

async function getWhitelistFile() {
  const whitelistPath = core.getInput('whitelist-file');
  if (!whitelistPath) {
    return '';
  }

  const whitelistFromBranch = core.getInput('whitelist-from-branch');
  const githubToken = core.getInput('github-token');

  if (!githubToken) {
    console.log('github-token input not provided. Using the whitelist from the current branch...');
    return `${process.env.GITHUB_WORKSPACE}/${whitelistPath}`;
  }
  else {
    const whitelistFromBranch = core.getInput('whitelist-from-branch') || process.env.GITHUB_BASE_REF;
    console.log(`Downloading the whitelist file from branch: ${whitelistFromBranch}`);
    return downloadWhiteListFile(whitelistFromBranch, whitelistPath, githubToken);
  }
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

    var klarEnv: { [key: string]: string ; } = {};
    // klarEnv = Object.assign({}, process.env);
    for (let key in process.env) {
      klarEnv[key] = process.env[key] || '';
    }

    klarEnv['CLAIR_ADDR'] = 'http://13.71.116.186:6060';

    const whitelistFile = await getWhitelistFile();
    // const whitelistFile = core.getInput('whitelist-file');
    if (whitelistFile) {
      klarEnv['WHITELIST_FILE'] = whitelistFile;
    }

    const username = core.getInput('username');
    const password = core.getInput('password');

    if (username && password) {
      klarEnv['DOCKER_USER'] = username;
      klarEnv['DOCKER_PASSWORD'] = password;
    }

    const options: ExecOptions = {
      env: klarEnv,
      // errStream: stdErrStream,
      // outStream: stdOutStream,
      ignoreReturnCode: true
    };
  
    const toolRunner = new ToolRunner(klarDownloadPath, [ imageToScan ], options);
    const code = await toolRunner.exec();
    
    if (code == 0) {
      console.log('Found 0 vulnerabilities');
    }
    else if (code == 1) {
      console.log('Found vulnerabilities in the container image');
      // console.log('stderr: ', error);
      // console.log('stdout: ', output);
      throw new Error('Found vulnerabilities in the container image');
    }
    else {
      throw new Error('An error occured while scanning the image for vulnerabilities.');
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run().then()
.catch(error => core.setFailed(error.message));