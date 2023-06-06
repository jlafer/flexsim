require("dotenv").config();

const { parseAndValidateArgs } = require('./helpers/args');
const { initializeCommonContext } = require('./helpers/context');
const { readJsonFile } = require('./helpers/files');
const { removeTasks } = require('./helpers/task');
const { changeActivity, fetchFlexsimWorkers } = require('./helpers/worker');
const { fetchWorkflow } = require('./helpers/workflow');

async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  console.log('cfg:', cfg);
  const context = initializeContext(cfg, args);
  await loadTwilioResources(context);
  console.log(`read workflow: ${context.workflow.friendlyName}`);
  await removeTasks(context);
}

run();

async function loadTwilioResources(context) {
  context.workflow = await fetchWorkflow(context);
  context.workers = await fetchFlexsimWorkers(context);
}

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  return context;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  const { acct, wrkspc, cfgdir } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { workflow };
}
