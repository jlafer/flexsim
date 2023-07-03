require("dotenv").config();
const { calcDimsValues, formatDt, formatSid, getDimValue, getSingleDimInstance, localeToFakerModule, readJsonFile } = require('flexsim-lib');

const { parseAndValidateArgs } = require('./helpers/args');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
const {submitTask} = require('./helpers/task');
const { delay } = require('./helpers/util');
const { fetchWorkflow } = require('./helpers/workflow');

async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  console.log('cfg:', cfg);
  const context = initializeContext(cfg, args);
  const { dimValues, dimInstances } = context;
  await loadTwilioResources(context);
  console.log(`read workflow: ${context.workflow.friendlyName}`);
  const valuesDescriptor = { entity: 'tasks', phase: 'arrive' };
  let now = Date.now();
  while (now < context.simStopTS) {
    const customer = getFakeCustomer(args.locale, cfg.metadata.customers);
    valuesDescriptor.id = customer.fullName;
    calcDimsValues(context, valuesDescriptor);
    const task = await submitTask(context, customer, valuesDescriptor);
    console.log(`new task ${formatSid(task.sid)} at`, formatDt(now));
    const dimAndInst = getSingleDimInstance('arrivalGap', dimInstances);
    const arrivalGap = getDimValue(dimValues, valuesDescriptor.id, dimAndInst);
    await delay(arrivalGap * 1000);
    now = Date.now();
  }
  console.log('custsim finished at', formatDt(now));
}

run();

const getFakeCustomer = (locale, customers) => {
  const { country, phoneFormat } = customers;
  const fakerModule = localeToFakerModule(locale);

  const customer = {};
  customer.fullName = fakerModule.person.fullName();
  customer.country = country;
  customer.phone = makePhoneNumber(fakerModule, locale, phoneFormat);
  customer.state = fakerModule.location.state({ abbreviated: true });
  customer.city = fakerModule.location.city();
  customer.zip = fakerModule.location.zipCode('#####');
  return customer;
};

const makePhoneNumber = (fakerModule, locale, phoneFormat) => {
  let phone = fakerModule.phone.number(phoneFormat);
  if (locale === 'en-us' && ['0', '1'].includes(phone.charAt(2)))
    phone = `+12${phone.substring(3)}`;
  return phone;
};

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
