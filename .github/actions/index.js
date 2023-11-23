const core = require('@actions/core');
const fm = require('front-matter');
const fs = require('fs');
const github = require('@actions/github');

const token = core.getInput('repo-token');
const octokit = github.getOctokit(token);

const instruments = JSON.parse(fs.readFileSync('instruments.json', 'utf-8'));
const tasks = JSON.parse(fs.readFileSync('tasks.json', 'utf-8'));

async function getIssues() {
  await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    });
}

async function runAction() {
  const issues = await getIssues();
}

runAction();

console.log(instruments);
console.log(tasks);

