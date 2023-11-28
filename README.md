# Instrument maintenance
This repo uses github actions to automate a TODO list with intervalled recurring tasks,
which are displayed as issues in the repo. The issue body text contains the next task due date
in front-matter YAML format, which can be parsed by the actions.

## For users
The issue list can be found sorted [here](/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc)

- [X] JSON files can be edited inside the github interface, which will create git commits
- [X] Closing an issue marks it as completed and will automatically reopen it with a new due date
- [X] Adding instruments or tasks to an instrument in `instruments.json` will create new corresponding issues
- [X] Removing an instrument or a task from an instrument will remove the corresponding issues
- [X] Removing tasks from `tasks.json` will label outstanding issues for those tasks with "Error"
- [X] Adding tasks to tasks.json will find existing tasks and remove the "Error" label in case they already exist
- [X] Changing task interval on tasks will change due dates for all open tasks


## How it works
The repo contains a JSON file containing the instruments, each with a list of tasks that apply to them. The tasks are specified in the `tasks.json` file. The following actions can occur:

- instruments.json edited -> create (new instrument, solvents), delete (instrument removed)
- tasks.json is edited -> change due dates where applicable, mark orphaned issues with "error" label (or remove it) and comment on them
- a task issue is closed -> update its due date to the corresponding task interval, reopen
- an issue is edited, (e.g new due date) -> update the issue title and label


## Issues
Issue body is in the shape of:
```
DO NOT EDIT FOLLOWING:
---
instrument: Velos
task: change-solvent
last_done: 2023-12-01
due: 2024-01-01
---
```



## Todo
- Task interval can differ per instrument?
