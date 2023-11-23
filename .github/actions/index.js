const core = require('@actions/core');
const fm = require('front-matter');
const fs = require('fs');

// const = core.getInput('input-file');

const instruments = JSON.parse(fs.readFileSync('instruments.json', 'utf-8'));
const tasks = JSON.parse(fs.readFileSync('tasks.json', 'utf-8'));


console.log(instruments);
console.log(tasks);

