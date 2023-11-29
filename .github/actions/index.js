const core = require('@actions/core');
const fm = require('front-matter');
const fs = require('fs');
const github = require('@actions/github');

const LABELTEXT_ERROR = 'Error';

const LABEL_MONTH = ['Less than 1 month', 30];
const LABEL_WEEK = ['Less than 1 week', 7];
const LABEL_DAYS = ['Less than 3 days', 3];
const LABEL_TODAY = ['Today', 1];
const LABEL_OVERDUE = ['Overdue', 0];

const LABELS_ORDER = [LABEL_OVERDUE, LABEL_TODAY, LABEL_DAYS, LABEL_WEEK, LABEL_MONTH];


async function getIssues() {
  let instr_issues = {};
  await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    })
      .then(issues => {
        issues.forEach(x => {
          if (fm.test(x.body)) {
            const issuedata = fm(x.body).attributes;
            if (!(issuedata.instrument in instr_issues)) {
              instr_issues[issuedata.instrument] = {};
            }
            const today = new Date(Date.now());
            const duedate = new Date(issuedata.due);
            const lastdate = new Date(issuedata.last_done);
            const calculated_interval = Math.round((duedate - lastdate) / 1000 / 3600 / 24);
            const days_left = Math.round((duedate - today) / 1000 / 3600 / 24);
            const extra_data = {
              issuenumber: x.number,
              labels: x.labels.map(l => l.name),
              calculated_interval: calculated_interval,
              days_left: days_left,
            };
            instr_issues[issuedata.instrument][issuedata.task] = Object.assign(extra_data, issuedata);
          }
        })
      })
  return instr_issues;
}


async function checkEditedInstrumentsOrTasks(instruments, tasks) {
  const issues = await getIssues();

  // First check for each instrument/task if there is something to do
  for ([ins_name, instr] of Object.entries(instruments)) {
    for (task of instr.tasks) {
      let issue = false;
      if (ins_name in issues && task in issues[ins_name]) {
          issue = issues[ins_name][task];
      }
      if (!(task in tasks) && issue && issue.labels.indexOf(LABELTEXT_ERROR) < 0) {
        console.log(`Orphan issue where task does not exist found: ${ins_name}/${task}`);
        await octokit.rest.issues.setLabels({
          owner: process.env.GITHUB_REPOSITORY_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          issue_number: issue.issuenumber,
          labels: [LABELTEXT_ERROR],
        })
      } else if (!issue && task in tasks) {
        console.log(`Creating new issue for ${ins_name}/${task}`);
        let duedate = new Date(Date.now());
        const todayDate = duedate.toLocaleDateString('sv-SE');
        duedate.setDate(duedate.getDate() + tasks[task].days_interval);
        const displayDate = duedate.toLocaleDateString('sv-SE');
        await octokit.rest.issues.create({
          owner: process.env.GITHUB_REPOSITORY_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          title: getTitle(displayDate, tasks[task].description, ins_name),
          body: getIssueBody(ins_name, task, todayDate, displayDate),
        })
      } else if (issue && issue.labels.indexOf(LABELTEXT_ERROR) > -1) {
        console.log(`Removing error label from issue ${ins_name}/${task}`);
        await octokit.rest.issues.setLabels({
          owner: process.env.GITHUB_REPOSITORY_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          issue_number: issue.issuenumber,
          labels: [],
        })
      } else {
          console.log(`No state changes found for ${ins_name}/${task}`);
      }

      // Also check for changed intervals and update
      if (issue && issue.calculated_interval !== Number(tasks[task].days_interval)) {
        let issueLastdate = new Date(issue.last_done);
        issueLastdate.setDate(issueLastdate.getDate() + tasks[task].days_interval);
        const displayDueDate = issueLastdate.toLocaleDateString('sv-SE');
        await octokit.rest.issues.update({
          owner: process.env.GITHUB_REPOSITORY_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          issue_number: issue.issuenumber,
          title: getTitle(displayDueDate, tasks[task].description, ins_name),
          body: getIssueBody(ins_name, task, issue.last_done, displayDueDate),
        })
      }
    }
  }
  for ([issue_instr, issuetasks] of Object.entries(issues)) {
    for ([issuetask, issuedata] of Object.entries(issuetasks)) {
      if (!(issue_instr in instruments && instruments[issue_instr].tasks.indexOf(issudata.task)>-1)) {
        console.log(`Closing issue ${issuedata.instrument}/${issuedata.task}`);
        await octokit.rest.issues.update({
          owner: process.env.GITHUB_REPOSITORY_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          issue_number: issuedata.issuenumber,
          state: 'closed',
        });
      }
    }
  }
}


function getTitle(displayDate, description, instrument) {
  return `Due ${displayDate}: ${description} for ${instrument}`;
}


function getIssueBody(instrument, task, lastdone, due) {
  return  `---
instrument: ${instrument}
task: ${task}
last_done: ${lastdone}
due: ${due}
---`;
  }


async function updateLabelsOrderByDate() {
  /* get all issues, and edit them in order of due date
  this way one can sort them by last edited on GH
  label them 
  */ 

  const issues = await getIssues();
  let orderedIssues = [];
  for ([_i, issuetasks] of Object.entries(issues)) {
    for ([_t, issue] of Object.entries(issuetasks)) {
      orderedIssues.push(issue);
    }
  }
  // most days left will be first
  orderedIssues.sort((a, b) => Number(b.days_left) - Number(a.days_left))
  for (issue of orderedIssues) {
    if (issue.labels.indexOf(LABELTEXT_ERROR) > -1) {
      let labeltext = '';
      for ([mintext, mindays] of LABELS_ORDER) {
        labeltext = mintext;
        if (issue.days_left < mindays) {
            break;
        }
      }
      await octokit.rest.issues.update({
        owner: process.env.GITHUB_REPOSITORY_OWNER,
        repo: process.env.GITHUB_REPO_NAME,
        issue_number: issue.issuenumber,
        labels: [labeltext],
      });
    }
  }
}


async function reopenIssueAndSetDueDate(issuenumber, tasks) {
  const issue = await octokit.rest.issues.get({
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    issue_number: issuenumber,
  });
  const issuedata = fm(issue.data.body).attributes;
  const task = tasks[issuedata.task]

  let duedate = new Date(Date.now());
  const todayDate = duedate.toLocaleDateString('sv-SE');
  duedate.setDate(duedate.getDate() + task.days_interval);
  const displayDate = duedate.toLocaleDateString('sv-SE');

  const newbody = getIssueBody(issuedata.instrument, issuedata.task, todayDate, displayDate);
  octokit.rest.issues.update({
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    issue_number: issuenumber,
    state: "open",
    body: newbody,
    title: getTitle(displayDate, task.description, issuedata.instrument),
  })
}


const token = core.getInput('repo-token');
const action = core.getInput('workflow-action');
const octokit = github.getOctokit(token);

const tasklist = JSON.parse(fs.readFileSync('tasks.json', 'utf-8'));
const tasks = Object.fromEntries(tasklist.map(x => [x.name, x]));

if (action == 'reopen-issue') {
  // When an issue is closed
  issuenumber = core.getInput('issuenumber');
  reopenIssueAndSetDueDate(issuenumber, tasks);
  updateLabelsOrderByDate();

} else if (action == 'update-labels') {
  // E.g run each night to update labels
  updateLabelsOrderByDate();

} else if (action == 'config-change') {
  const instruments = Object.fromEntries(JSON.parse(fs.readFileSync('instruments.json', 'utf-8')).map(x => [x.name, x]));

  checkEditedInstrumentsOrTasks(instruments, tasks);
  updateLabelsOrderByDate();
  // When instruments/tasks change

}

// if /case switch for commands
//console.log(instruments);
//console.log(tasks);

