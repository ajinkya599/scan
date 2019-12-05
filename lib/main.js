"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const Stream = __importStar(require("stream"));
const core = __importStar(require("@actions/core"));
const dockerHelper_1 = require("./dockerHelper");
const HttpClient_1 = require("typed-rest-client/HttpClient");
const toolrunner_1 = require("@actions/exec/lib/toolrunner");
const download = require('download');
function downloadKlar() {
    return __awaiter(this, void 0, void 0, function* () {
        const klarUrl = "https://github.com/optiopay/klar/releases/download/v2.4.0/klar-2.4.0-linux-amd64";
        const klarDownloadDir = `${process.env['GITHUB_WORKSPACE']}/_temp/tools`;
        return download(klarUrl, klarDownloadDir, { extract: true }).then(() => {
            const klarDownloadPath = `${klarDownloadDir}/klar-2.4.0-linux-amd64`;
            fs.chmodSync(klarDownloadPath, '777');
            return klarDownloadPath;
        });
    });
}
function downloadWhiteListFile(branch, path, token) {
    return __awaiter(this, void 0, void 0, function* () {
        const whitelistFileUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/${branch}/${path}`;
        const parts = path.split('/');
        const whitelistFileName = parts[parts.length - 1];
        const whitelistFileDownloadDir = `${process.env['GITHUB_WORKSPACE']}/_temp/containerscan`;
        console.log('whitelistFileUrl: ', whitelistFileUrl);
        console.log('whitelistFileName: ', whitelistFileName);
        console.log('whitelistFileDownloadDir: ', whitelistFileDownloadDir);
        console.log('token: ', token);
        return download(whitelistFileUrl, whitelistFileDownloadDir, { headers: { Authorization: `token ${token}` } }).then(() => {
            return `${whitelistFileDownloadDir}/${whitelistFileName}`;
        });
    });
}
function getWhitelistFilePath() {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
function getPullRequestHeadShaFromEventPayload() {
    let pullRequestSha = '';
    const eventPayloadPath = process.env.GITHUB_EVENT_PATH;
    //~~ make these debug logs instead of console logs.
    if (eventPayloadPath) {
        const fileContent = fs.readFileSync(eventPayloadPath, { encoding: 'utf-8' });
        try {
            const eventJson = JSON.parse(fileContent);
            // console.log('eventJson: ', eventJson);
            if (eventJson && eventJson.pull_request && eventJson.pull_request.head && eventJson.pull_request.head.sha) {
                pullRequestSha = eventJson.pull_request.head.sha;
                console.log('Obtained pull request head commit sha from the event payload: ', pullRequestSha);
            }
            else {
                console.log('Pull request head commit sha not present in the event payload. Skipping pull request status update...');
            }
        }
        catch (error) {
            console.log('An error occured while parsing the contents of the event payload. Skipping pull request status update. Error: ', error);
        }
    }
    else {
        console.log('GITHUB_EVENT_PATH is empty. Unable to obtain SHA of the pull request\'s most recent commit.\n Skipping pull request status update...');
    }
    return pullRequestSha;
}
function updateCommitStatus(state, description) {
    return __awaiter(this, void 0, void 0, function* () {
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
        };
        const requestHeaders = {
            Authorization: `token ${githubToken}`
        };
        const httpClient = new HttpClient_1.HttpClient('GITHUB_RUNNER');
        try {
            console.log('Trying to update the status of container scan..');
            const response = yield httpClient.request("POST", requestUri, JSON.stringify(requestBody), requestHeaders);
            const body = yield response.readBody();
            // console.log('Response after update. Statuscode: ', response.message.statusCode, '. StatusMessage: ', response.message.statusMessage, '. Body: ', body);//~~make this debug log
        }
        catch (error) {
            console.log('An error occured while updating the status: ', error);
        }
    });
}
function getVulnerabilitiesSummary(output) {
    let summary = 'Found vulnerabilities in the container image.';
    if (output) {
        // parsing output from klar invocation. A sample output when vulnerabilities are found:
        // [command]/home/runner/work/playground/playground/_temp/tools/klar-2.4.0-linux-amd64 ***/scanrepo:test
        // clair timeout 1m0s
        // docker timeout: 1m0s
        // whitelist file: /home/runner/work/playground/playground/_temp/containerscan/cve-whitelist.yml
        // Analysing 8 layers
        // Got results from Clair API v1
        // Whitelisted 15 vulnerabilities
        // Found 107 vulnerabilities
        // Unknown: 65
        // Negligible: 38
        // Low: 1
        // CVE-2016-3189: [Low] 
        // Found in: bzip2 [1.0.6-7]
        // Fixed By: 1.0.6-7+deb8u1
        // Use-after-free vulnerability in bzip2recover in bzip2 1.0.6 allows remote attackers to cause a denial of service (crash) via a crafted bzip2 file, related to block ends set to before the start of the block.
        // https://security-tracker.debian.org/tracker/CVE-2016-3189
        // -----------------------------------------
        const foundIndex = output.indexOf('Found');
        const firstCveIndex = output.indexOf('CVE-');
        if (foundIndex != -1 && firstCveIndex != -1) {
            const domainStr = output.substring(foundIndex, firstCveIndex);
            const summaryRows = domainStr.split('\n').filter(row => row);
            summaryRows.forEach(row => {
                summary = summary + '\n' + row;
            });
        }
    }
    return summary;
}
function setupClairServer() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('Setting up Clair server for image scanning...');
            const dockerHelper = new dockerHelper_1.DockerHelper();
            // Create Docker network
            console.log('Creating Docker network...');
            yield dockerHelper.executeDockerCommand(['network', 'create', 'scannetwork', '--subnet=172.28.0.0/16', '--ip-range=172.28.5.0/24']);
            console.log('Docker network created...');
            // Create local registry
            console.log('Creating registry container...');
            yield dockerHelper.executeDockerCommand(['run', '-p', '5000:5000', '--restart=always', '-d', '--network', 'scannetwork', '--name', 'registry-local', 'registry:2']);
            console.log('Created registry container...');
            // Create clair-db container
            console.log('Creating clair-db container...');
            yield dockerHelper.executeDockerCommand(['run', '-d', '--network', 'scannetwork', '--network-alias', 'postgres', '--name', 'clair-db', 'arminc/clair-db:latest']);
            console.log('Created clair-db container...');
            // Create clair-local-scan container
            console.log('Creating clair-local-scan container...');
            yield dockerHelper.executeDockerCommand(['run', '-p', '6060:6060', '--network', 'scannetwork', '-d', '--name', 'clair-local-scan', 'arminc/clair-local-scan:latest', '--insecure-tls']);
            console.log('Created clair-local-scan container...');
            console.log('Clair server is up and running...');
        }
        catch (error) {
            const errorMessage = `An error occured while setting up resources for container scanning. Error: ${error}`;
            console.log(errorMessage);
            throw (errorMessage);
        }
    });
}
function cleanupClairResources() {
    return __awaiter(this, void 0, void 0, function* () {
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // console.log("SECRETS_GITHUB_TOKEN", process.env.SECRETS_GITHUB_TOKEN);
            // console.log("GITHUB_BASE_REF", process.env.GITHUB_BASE_REF);
            // console.log("GITHUB_SHA", process.env.GITHUB_SHA);
            // console.log("GITHUB_REF", process.env.GITHUB_REF);
            // console.log("GITHUB_EVENT_PATH", process.env.GITHUB_EVENT_PATH);
            // console.log("Trying to extract the pull request commit from the GitHub Event payload...");
            // const prSha = getPullRequestHeadShaFromEventPayload();
            // console.log("Extracted prSha: ", prSha);
            yield setupClairServer();
            const klarDownloadPath = yield downloadKlar();
            console.log("klarDownloadPath: ", klarDownloadPath);
            const imageToScan = core.getInput('image-to-scan');
            console.log("Scanning image: ", imageToScan);
            let klarError = "";
            let klarOutput = "";
            let stdErrStream = new Stream.Writable({
                write(chunk, encoding, callback) {
                    klarError += chunk.toString();
                    callback();
                }
            });
            let stdOutStream = new Stream.Writable({
                write(chunk, encoding, callback) {
                    klarOutput += chunk.toString();
                    callback();
                }
            });
            // stdErrStream.on('data', (data: string) => {
            //   error += data;
            // });
            // stdOutStream.on('data', (data: string) => {
            //   output += data;
            // });
            var klarEnv = {};
            // for (let key in process.env) {
            //   klarEnv[key] = process.env[key] || '';
            // }
            // klarEnv['CLAIR_ADDR'] = 'http://13.71.116.186:6060';
            klarEnv['CLAIR_ADDR'] = 'http://localhost:6060';
            klarEnv['DOCKER_INSECURE'] = 'true';
            const whitelistFile = yield getWhitelistFilePath();
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
            const options = {
                env: klarEnv,
                errStream: stdErrStream,
                outStream: stdOutStream,
                ignoreReturnCode: true
            };
            const dockerHelper = new dockerHelper_1.DockerHelper();
            // Tag and push local image
            console.log('Tagging local image...');
            yield dockerHelper.executeDockerCommand(['tag', imageToScan, 'localhost:5000/containerscan:temp']);
            console.log('Tagged local image...');
            console.log('Pushing image to local registry...');
            yield dockerHelper.executeDockerCommand(['push', 'localhost:5000/containerscan:temp']);
            console.log('Pushed image to local registry...');
            const toolRunner = new toolrunner_1.ToolRunner(klarDownloadPath, ['localhost:5000/containerscan:temp'], options);
            const code = yield toolRunner.exec();
            console.log(klarOutput);
            if (code == 0) {
                console.log('Found 0 vulnerabilities');
                updateCommitStatus('success', 'Found 0 vulnerabilities in the container image');
            }
            else if (code == 1) {
                const summary = getVulnerabilitiesSummary(klarOutput);
                updateCommitStatus('failure', summary);
                throw new Error(summary);
            }
            else {
                if (klarError) {
                    console.log(klarError);
                }
                updateCommitStatus('error', 'An error occured while scanning the image for vulnerabilities.');
                throw new Error('An error occured while scanning the image for vulnerabilities.');
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run().then()
    .catch(error => core.setFailed(error.message));
