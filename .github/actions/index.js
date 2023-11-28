const core = require('@actions/core');
const fm = require('front-matter');
const fs = require('fs');
const github = require('@actions/github');

const LABELTEXT_ERROR = 'Error';

async function getIssues() {
  let instr_issues = {};
  await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    })
      .then(issues => {
        issues.forEach(x => {
          const issuedata = fm(x.body).attributes;
          if (!(issuedata.instrument in instr_issues)) {
            instr_issues[issuedata.instrument] = {};
          }
          const duedate = new Date(issuedata.due);
          const lastdate = new Date(issuedata.last_done);
          const calculated_interval = Math.round((duedate - lastdate) / 1000 / 3600 / 24);
            console.log(x);
          const extra_data = {
            issuenumber: x.number,
            labels: x.labels.map(l => l.name),
            calculated_interval: calculated_interval,
          };
          instr_issues[issuedata.instrument][issuedata.task] = Object.assign(extra_data, issuedata);
        })
      })
     // FIXME first try to figure out how to address this things before writing it
  return instr_issues;
}

// FIXME enum for labels (text, color)

async function checkEditedInstrumentsOrTasks(instruments, tasks) {
  const issues = await getIssues();
    console.log(JSON.stringify(issues));
    console.log(JSON.stringify(tasks));

  // First check for each instrument/task if there is something to do
  for (instr of instruments) {
    for (task of instr.tasks) {
      console.log(`${instr.name}, ${task}`);
      let issue = false;
      if (instr.name in issues && task in issues[instr.name]) {
          issue = issues[instr.name][task];
      }
      if (!(task in tasks) && issue && issue.labels.indexOf(LABELTEXT_ERROR) < 0) {
        await octokit.rest.issues.setLabels({
          owner: process.env.GITHUB_REPOSITORY_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          issue_number: issue.issuenumber,
          labels: [LABELTEXT_ERROR],
        })
          console.log('SHOULD ORPHAN');
          // FIXME orphan the task label
      } else if (!(task in tasks)) {
          console.log('SHOULD ERROR');
          // FIXME error the job at the end -- should we have this, instead below?
      } else if (!issue) {
          console.log('creating new issue');
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
      } else if (issue.labels.indexOf(LABELTEXT_ERROR) > -1) {
        await octokit.rest.issues.setLabels({
          owner: process.env.GITHUB_REPOSITORY_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          issue_number: issue.issuenumber,
          labels: [],
        })
          console.log('SHOULD REMOVE ERROR');
          // FIXME remove error label
      } else if (issues[instr.name][task].calculated_interval !== Number(tasks[task].days_interval)) {
        let issueLastdate = new Date(issue.last_done);
        issueLastdate.setDate(issueLastdate.getDate() + tasks[task].days_interval);
        const displayDueDate = issueLastdate.toLocaleDateString('sv-SE');

        await octokit.rest.issues.update({
          owner: process.env.GITHUB_REPOSITORY_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          issue_number: issue.issuenumber,
          body: getIssueBody(instr.name, task, issue.last_done, displayDueDate),
        })
          console.log('SHOULD CHANGE INTERVAL');
          // FIXME update due date to new interval
      } else {
          console.log('NO CHANGES!');
      }
      // FIXME combined remove label and bad interval!
    }

    // Now go through issues instead and check if instruments exist:
      // FIXME Remove issue when instrument is not exist or has no tasks
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

