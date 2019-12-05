import * as core from '@actions/core';
import * as fs from 'fs';
import { ToolRunner } from '@actions/exec/lib/toolrunner';
import { ExecOptions } from '@actions/exec/lib/interfaces';
import * as Stream from 'stream';
import { HttpClient } from 'typed-rest-client/HttpClient';
import * as querystring from 'querystring';
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

async function getWhitelistFilePath() {
  const whitelistPath = core.getInput('whitelist-file');
  if (!whitelistPath) {
    return '';
  }

  const githubToken = core.getInput('github-token');

  if (!githubToken) {
    console.log('github-token input not provided. Using the whitelist from the current branch...');
    return `${process.env.GITHUB_WORKSPACE}/${whitelistPath}`;
  }
  else {
    const whitelistFromBranch = core.getInput('whitelist-from-branch') || process.env.GITHUB_BASE_REF;
    if (whitelistFromBranch) {
      console.log(`Downloading the whitelist file from branch: ${whitelistFromBranch}`);
      return downloadWhiteListFile(whitelistFromBranch, whitelistPath, githubToken);
    }
    else {
      console.log('whitelist-from-branch is not specified, and it seems this is not a PR build. Using the whitelist from the current branch...');
      return `${process.env.GITHUB_WORKSPACE}/${whitelistPath}`;
    }
  }
}

function getPullRequestHeadShaFromEventPayload(): string {
  let pullRequestSha = '';
  const eventPayloadPath = process.env.GITHUB_EVENT_PATH;
  //~~ make these debug logs instead of console logs.
  if (eventPayloadPath) {
    const fileContent = fs.readFileSync(eventPayloadPath, { encoding: 'utf-8' });
    try {
      const eventJson = JSON.parse(fileContent);
      console.log('eventJson: ', eventJson);

      if (eventJson && eventJson.pull_request && eventJson.pull_request.head && eventJson.pull_request.head.sha) {
        pullRequestSha = eventJson.pull_request.head.sha;
        console.log('Obtained pull request head commit sha from the event payload: ', pullRequestSha);
      }
      else {
        console.log('Pull request head commit sha not present in the event payload. Skipping pull request status update...');
      }
    }
    catch(error) {
      console.log('An error occured while parsing the contents of the event payload. Skipping pull request status update. Error: ', error);
    }
  }
  else {
    console.log('GITHUB_EVENT_PATH is empty. Unable to obtain SHA of the pull request\'s most recent commit.\n Skipping pull request status update...');
  }

  return pullRequestSha;
}

async function updateCommitStatus(state: string, description: string) {
  const githubToken = core.getInput('github-token');
  if (!githubToken) {
    return '';
  }

  const pullRequestHeadSha = getPullRequestHeadShaFromEventPayload();
  const requestUri = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/statuses/${pullRequestHeadSha}`;
  console.log("requestUri: ", requestUri);
  const requestBody = {
    state: state,
    target_url: `https://github.com/${process.env.GITHUB_REPOSITORY}/commit/${pullRequestHeadSha}/checks`,
    description: description,
    context: "container-scan"
  }

  const requestHeaders = {
    Authorization: `token ${githubToken}`
  };

  const httpClient = new HttpClient('GITHUB_RUNNER');
  try {
    console.log('Trying to update the status of container scan..');
    const response = await httpClient.request("POST", requestUri, JSON.stringify(requestBody), requestHeaders);
    const body = await response.readBody();
    console.log('Response after update. Statuscode: ', response.message.statusCode, '. StatusMessage: ', response.message.statusMessage, '. Body: ', body);//~~make this debug log
  }
  catch(error) {
    console.log('An error occured while updating the status: ', error);
  }
}

async function run() {
  try {    
    // console.log("SECRETS_GITHUB_TOKEN", process.env.SECRETS_GITHUB_TOKEN);
    // console.log("GITHUB_BASE_REF", process.env.GITHUB_BASE_REF);
    // console.log("GITHUB_SHA", process.env.GITHUB_SHA);
    // console.log("GITHUB_REF", process.env.GITHUB_REF);
    // console.log("GITHUB_EVENT_PATH", process.env.GITHUB_EVENT_PATH);
    // console.log("Trying to extract the pull request commit from the GitHub Event payload...");
    // const prSha = getPullRequestHeadShaFromEventPayload();
    // console.log("Extracted prSha: ", prSha);
    
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
    // for (let key in process.env) {
    //   klarEnv[key] = process.env[key] || '';
    // }

    klarEnv['CLAIR_ADDR'] = 'http://13.71.116.186:6060';

    const whitelistFile = await getWhitelistFilePath();
    if (whitelistFile) {
      klarEnv['WHITELIST_FILE'] = whitelistFile;
    }

    const username = core.getInput('username');
    const password = core.getInput('password');

    if (username && password) {
      klarEnv['DOCKER_USER'] = username;
      klarEnv['DOCKER_PASSWORD'] = password;
    }

    const severityThreshold = core.getInput('severity-threshold');
    if (severityThreshold) {
      klarEnv['CLAIR_OUTPUT'] = severityThreshold;
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
      updateCommitStatus('success', 'Found 0 vulnerabilities in the container image');
    }
    else if (code == 1) {
      console.log('Found vulnerabilities in the container image');
      updateCommitStatus('failure', 'Found vulnerabilities in the container image');
      // console.log('stderr: ', error);
      // console.log('stdout: ', output);
      throw new Error('Found vulnerabilities in the container image');
    }
    else {
      updateCommitStatus('error', 'An error occured while scanning the image for vulnerabilities.');
      throw new Error('An error occured while scanning the image for vulnerabilities.');
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run().then()
.catch(error => core.setFailed(error.message));