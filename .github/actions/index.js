const core = require('@actions/core');
const fm = require('front-matter');
const fs = require('fs');
const github = require('@actions/github');


function getIssues() {
  let issues = {};
  octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    })
      .then(issues => {
        issues.forEach(x => {
          console.log(`Issue ${x.number} with body ${x.body} and last opened ?`);
          console.log(JSON.stringify(x));
        })
      })
  return issues;
}


function checkEditedInstrumentsOrTasks() {
  const issues = getIssues();
    // for each instrument, check if an issue exists for each task
    // // remove issues for that instrument if task is not in instrument list
    // for each issue, if no instrument, remove it
    //
    // for each task, check if an orphan issue exists and remove error label
    // // for each issue, check if it needs error labeling
    //
}

function editIssuesOrderByDate() {
    // get all issues, and edit them in order of due date
    // this way one can sort them by last edited on GH
}


async function reopenIssueAndSetDueDate(issuenumber, tasks) {
  const issue = await octokit.rest.issues.get({
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    issue_number: issuenumber,
  });
  console.log(issue);
  const issuedata = fm(issue.data.body).attributes;
  console.log(JSON.stringify(issuedata));
  const interval = tasks[issuedata.task].days_interval;

  let duedate = new Date(issuedata.due);
  duedate.setDate(duedate.getDate() + interval);

  const newbody = `---
instrument: ${issuedata.instrument}
task: ${issuedata.task}
due: ${duedate}
---`;
  octokit.rest.issues.update({
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    issue_number: issuenumber,
    state: "open",
    body: newbody,
    title: `Due ${duedate} - ${issuedata.task} for ${issuedata.instrument}`,
  })

  editIssuesOrderByDate();
}


const token = core.getInput('repo-token');
const action = core.getInput('workflow-action');
const octokit = github.getOctokit(token);

const instruments = JSON.parse(fs.readFileSync('instruments.json', 'utf-8'));
const tasklist = JSON.parse(fs.readFileSync('tasks.json', 'utf-8'));
const tasks = Object.fromEntries(tasklist.map(x => [x.name, x]));
if (action == 'reopen-issue') {
  issuenumber = core.getInput('issuenumber');
  reopenIssueAndSetDueDate(issuenumber, tasks);
}

// if /case switch for commands
//console.log(instruments);
//console.log(tasks);

