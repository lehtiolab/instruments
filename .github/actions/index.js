const core = require('@actions/core');
const fm = require('front-matter');
const fs = require('fs');

const inputfn = core.getInput('input-file');
console.log(`Reading ${inputfn}`);


const contents = JSON.parse(fs.readFileSync(inputfn, 'utf-8'));
console.log(contents);

