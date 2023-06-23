require("dotenv").config();

const {parseAndValidateArgs} = require('./helpers/args');
const { calcPropsValues } = require('./helpers/calcs');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
const { readJsonFile } = require('./helpers/files');
const { getSinglePropInstance } = require('./helpers/schema');
const {submitTask} = require('./helpers/task');
const { delay, formatDt, formatSid, getPropValue, localeToFakerModule } = require('./helpers/util');
const { fetchWorkflow } = require('./helpers/workflow');

async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  console.log('cfg:', cfg);
  const context = initializeContext(cfg, args);
  const { propValues, propInstances } = context;
  await loadTwilioResources(context);
  console.log(`read workflow: ${context.workflow.friendlyName}`);
  const valuesDescriptor = { entity: 'tasks', phase: 'arrive' };
  let now = Date.now();
  while (now < context.simStopTS) {
    const fakerModule = localeToFakerModule(args.locale);
    valuesDescriptor.id = fakerModule.person.fullName();
    calcPropsValues(context, valuesDescriptor);
    const task = await submitTask(context, valuesDescriptor);
    console.log(`new task ${formatSid(task.sid)} at`, formatDt(now));
    const propAndInst = getSinglePropInstance('arrivalGap', propInstances);
    const arrivalGap = getPropValue(propValues, valuesDescriptor.id, propAndInst);
    await delay(arrivalGap * 1000);
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
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', t: 'timeLim', l: 'locale' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  args.locale = args.locale || 'en-us';
  const { acct, wrkspc, cfgdir, timeLim, locale } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('timeLim:', timeLim);
  console.log('locale:', locale);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, workflow };
}
