const express = require('express');
const { parseAndValidateArgs } = require('./helpers/args');
const { initializeCommonContext } = require('./helpers/context');
//const { changeActivity, fetchWorkers } = require('./helpers/worker');
//const { acceptRes, completeTask } = require('./helpers/task');

const args = parseAndValidateArgs();
const { acct, auth } = args;
console.log('acct:', acct);
console.log('auth:', auth);
const cfg = readConfiguration(args)
const ctx = initializeCommonContext(cfg, args);

const app = express()
const port = 3000

app.get('/', (req, res) => {
  console.log(`agentsim said hello`);
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`agentsim listening on port ${port}`)
});

const advanceTheAgent = (i, idx) => {
  const limit = 5;
  console.log(`advanceTheAgent ${i} to ${idx} at ${(Date.now() / 1000)}`);
  if (idx < limit) {
    setTimeout(advanceTheAgent, (i * 3000 + 5000), i, idx + 1);
  }
};

const initializeApp = (cfg, args) => {
  console.log(`initializing app`);
  for (let i = 0; i < 4; i++) {
    advanceTheAgent(i, 1);
  }
}
