require("dotenv").config();

const {parseAndValidateArgs} = require('./helpers/args');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
const { readJsonFile } = require('./helpers/files');
const {submitTask} = require('./helpers/task');
const { delay } = require('./helpers/util');
const { fetchWorkflow } = require('./helpers/workflow');

async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  console.log('cfg:', cfg);
  const context = initializeContext(cfg, args);
  await loadTwilioResources(context);
  console.log(`read workflow: ${context.workflow.friendlyName}`);
  let now = Date.now();
  while (now < context.simStopTS) {
    const task = await submitTask(context);
    //report = addTaskToReport(task)
    console.log(`new task ${task.sid} at`, now);
    await delay(context.arrivallDelayBase);
    now = Date.now();
  }
  //reportWorkload(report)
  console.log('custsim finished at', now);
}

run();

async function loadTwilioResources(context) {
  context.workflow = await fetchWorkflow(context);
  context.channels = await fetchTaskChannels(context);
}

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  context.simStopTS = context.simStartTS + (args.timeLim * 1000);
  context.arrivallDelayBase = Math.floor(60 / cfg.simulation.arrivalRate) * 1000;
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
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  const simulation = await readJsonFile(`${cfgdir}/simulation.json`);
  return { simulation, workflow };
}
