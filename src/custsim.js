require("dotenv").config();

const {parseAndValidateArgs} = require('./helpers/args');
const { calcValue } = require('./helpers/calcs');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
const { readJsonFile } = require('./helpers/files');
const { getAttributeProps, getSingleProp } = require('./helpers/schema');
const {submitTask} = require('./helpers/task');
const { delay, formatDt, formatSid } = require('./helpers/util');
const { fetchWorkflow } = require('./helpers/workflow');

async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  console.log('cfg:', cfg);
  const context = initializeContext(cfg, args);
  const { metadata } = cfg;
  metadata.taskAttributes = getAttributeProps('task', metadata.props);
  const { props } = metadata;
  await loadTwilioResources(context);
  console.log(`read workflow: ${context.workflow.friendlyName}`);
  let now = Date.now();
  while (now < context.simStopTS) {
    const task = await submitTask(context);
    console.log(`new task ${formatSid(task.sid)} at`, formatDt(now));
    const propAndInst = getSingleProp('arrivalGap', props);
    const delayMsec = calcValue(propAndInst) * 1000;
    await delay(delayMsec);
    now = Date.now();
  }
  console.log('custsim finished at', formatDt(now));
}

run();

async function loadTwilioResources(context) {
  context.workflow = await fetchWorkflow(context);
  context.channels = await fetchTaskChannels(context);
}

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  context.simStopTS = context.simStartTS + (args.timeLim * 1000);
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
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, workflow };
}
