require("dotenv").config();
const express = require('express');

const { fetchActivities } = require('./helpers/activity');
const { parseAndValidateArgs } = require('./helpers/args');
const { calcActivityChange, calcValue } = require('./helpers/calcs');
const { initializeCommonContext } = require('./helpers/context');
const { readJsonFile } = require('./helpers/files');
const { completeTask } = require('./helpers/task');
const { findObjInList, formatDt, formatSid } = require('./helpers/util');
const {
  changeActivity, fetchFlexsimWorkers, fetchWorker, getWorker
} = require('./helpers/worker');

async function init() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  const context = initializeContext(cfg, args);
  await loadTwilioResources(context);
  await loginAllWorkers(context);
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (req, res) => {
    console.log(`agentsim said hello`);
    res.send('Hello World!')
  })

  app.post('/reservation', (req, res) => {
    const { TaskSid, WorkerSid } = req.body;
    const { cfg } = context;
    const { simulation } = cfg;
    const worker = getWorker(context, WorkerSid);
    const { sid, friendlyName } = worker;
    const now = Date.now();
    console.log(formatDt(now));
    console.log(`  ${friendlyName} reserved for task ${formatSid(TaskSid)}`);
    const talkTime = calcValue(simulation.talkTime)
    setTimeout(
      function () {
        const now = Date.now();
        console.log(formatDt(now));
        console.log(`  ${friendlyName} completing task ${formatSid(TaskSid)}`);
        completeTask(context, TaskSid);
      },
      (talkTime * 1000)
    );
    res.send({ instruction: 'accept' });
  })

  app.listen(args.port, () => {
    console.log(`agentsim listening on port ${args.port}`)
  });
}

init();

async function loginAllWorkers(context) {
  const { workers, activities } = context;
  const availableAct = findObjInList('friendlyName', 'Available', activities);
  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    const { sid, friendlyName, attributes } = worker;
    console.log(`${friendlyName} [${attributes.full_name}] signing in`);
    await changeActivity(context, sid, availableAct.sid);
    const activityChange = calcActivityChange(context, worker);
    const [activityName, delayMsec] = activityChange;
    setTimeout(
      function () {
        changeActivityAndWait(context, sid, activityName);
      },
      delayMsec
    );
  }
}

async function changeActivityAndWait(context, WorkerSid, activityName) {
  const now = Date.now();
  const worker = await fetchWorker(context, WorkerSid);
  const { sid, friendlyName, activityName: currActivityName } = worker;

  const { activities } = context;
  const activity = findObjInList('friendlyName', activityName, activities);
  const availableAct = findObjInList('friendlyName', 'Available', activities);

  const activitySid = (currActivityName === 'Available')
    ? activity.sid
    : availableAct.sid;
  const actualName = (currActivityName === 'Available')
    ? activityName
    : availableAct.friendlyName;
  console.log(formatDt(now));
  console.log(`  ${friendlyName} changing from ${currActivityName} to ${actualName}`);
  try {
    await changeActivity(context, sid, activitySid);
  }
  catch (err) { }

  const activityChange = calcActivityChange(context, worker);
  const [nextActivityName, delayMsec] = activityChange;
  setTimeout(changeActivityAndWait, delayMsec, context, WorkerSid, nextActivityName);
}

async function loadTwilioResources(context) {
  context.activities = await fetchActivities(context);
  context.workers = await fetchFlexsimWorkers(context);
}

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  return context;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', t: 'timeLim', p: 'port' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, AGENTSIM_PORT } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.port = args.port || AGENTSIM_PORT || 3000;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  const { acct, wrkspc, cfgdir, port, timeLim } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('port:', port);
  console.log('timeLim:', timeLim);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const simulation = await readJsonFile(`${cfgdir}/simulation.json`);
  const workers = await readJsonFile(`${cfgdir}/workers.json`);
  return { metadata, simulation, workers };
}
