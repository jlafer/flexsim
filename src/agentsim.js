require("dotenv").config();
const express = require('express');

const { parseAndValidateArgs } = require('./helpers/args');
const { initializeCommonContext } = require('./helpers/context');
const { readJsonFile } = require('./helpers/files');
const { fetchActivities } = require('./helpers/activity');
const { changeActivity, fetchFlexsimWorkers } = require('./helpers/worker');
const { findObjInList } = require('./helpers/util');
const { completeTask } = require('./helpers/task');

async function init() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  const context = initializeContext(cfg, args);
  await loadTwilioResources(context);
  await loginAllWorkers(context);
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const port = 3000;

  app.get('/', (req, res) => {
    console.log(`agentsim said hello`);
    res.send('Hello World!')
  })

  app.post('/reservation', (req, res) => {
    const { TaskSid, ReservationSid, WorkerSid } = req.body;
    const now = new Date();
    console.log(now);
    console.log(`  reservation ${ReservationSid} for task ${TaskSid} assigned to worker ${WorkerSid}`);
    setTimeout(
      function () {
        const now = new Date();
        console.log(now);
        console.log(`  completing task ${TaskSid} assigned to worker ${WorkerSid}`);
        completeTask(context, TaskSid);
      },
      5000
    );
    res.send({ instruction: 'accept' });
  })

  app.listen(port, () => {
    console.log(`agentsim listening on port ${port}`)
  });
}

init();

async function loginAllWorkers(context) {
  const { workers, activities } = context;
  const availableAct = findObjInList('friendlyName', 'Available', activities);
  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    console.log(`signing in ${worker.friendlyName}`);
    await changeActivity(context, worker.sid, availableAct.sid);
  }
}

async function loadTwilioResources(context) {
  context.activities = await fetchActivities(context);
  context.workers = await fetchFlexsimWorkers(context);
}

const advanceTheAgent = (i, idx) => {
  const limit = 5;
  console.log(`advanceTheAgent ${i} to ${idx} at ${(Date.now() / 1000)}`);
  if (idx < limit) {
    setTimeout(advanceTheAgent, (i * 3000 + 5000), i, idx + 1);
  }
};

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  return context;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', t: 'timeLim' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  const { acct, wrkspc, cfgdir, timeLim } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('timeLim:', timeLim);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const simulation = await readJsonFile(`${cfgdir}/simulation.json`);
  const workers = await readJsonFile(`${cfgdir}/workers.json`);
  return { simulation, workers };
}
