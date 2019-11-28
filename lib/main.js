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
const core = __importStar(require("@actions/core"));
const download = require('download');
const fs = __importStar(require("fs"));
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
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const klarDownloadPath = yield downloadKlar();
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
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run().then()
    .catch(error => core.setFailed(error.message));