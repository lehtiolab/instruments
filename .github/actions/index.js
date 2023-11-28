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

// FIXME enum for labels (text, color)

async function checkEditedInstrumentsOrTasks(instruments, tasks) {
  const issues = getIssues();

  for (instr of instruments) {
    for (task of instr.tasks) {
      issue_exist = instr.name in issues && task in issues[instr.name]
      if (!(task in tasks) && issue_exist) {
          console.log('SHOULD ORPHAN');
          // FIXME orphan the task label
      } else if (!(task in tasks)) {
          console.log('SHOULD ERROR');
          // FIXME error the job at the end -- should we have this, instead below?
      } else if (!issue_exist) {
        let duedate = new Date(Date.now());
        const todayDate = duedate.toLocaleDateString('sv-SE');
        duedate.setDate(duedate.getDate() + tasks[task].days_interval);
        const displayDate = duedate.toLocaleDateString('sv-SE');
        await octokit.rest.issues.create({
          owner: process.env.GITHUB_REPOSITORY_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          title: getTitle(displayDate, tasks[task].description, instr.name),
          body: getIssueBody(instr.name, task, todayDate, displayDate),
        })
        // FIXME orphan label if no task exist??
      } else if (issues[instr.name][task].label_text === LABELTEXT_ERROR) {
          console.log('SHOULD SET ERROR');
          // FIXME remove error label
      } else if (issues[instr.name][task].calculated_interval !== tasks[task].days_interval) {
          console.log('SHOULD CHANGE INTERVAL');
          // FIXME update due date to new interval
      }
      // FIXME combined remove label and bad interval etc
    }
  }
    // for each instrument, check if an issue exists for each task
    // // remove issues for that instrument if task is not in instrument list
    // for each issue, if no instrument, remove it
    //
    // for each task, check if an orphan issue exists and remove error label
    // // for each issue, check if it needs error labeling
    //
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


function updateLabelsOrderByDate() {
    // get all issues, and edit them in order of due date
    // this way one can sort them by last edited on GH
    // label them 
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
  updateLabelsOrderByDate();
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

} else if (action == 'update-labels') {
  // E.g run each night to update labels
  updateLabelsOrderByDate();

} else if (action == 'config-change') {
  const instruments = JSON.parse(fs.readFileSync('instruments.json', 'utf-8'));
  checkEditedInstrumentsOrTasks(instruments, tasks);
  // When instruments/tasks change

}

// if /case switch for commands
//console.log(instruments);
//console.log(tasks);

