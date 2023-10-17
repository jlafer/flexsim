require("dotenv").config();
const axios = require('axios');
const {
  calcDimsValues, formatSid, getAttributes, getDimValue, getDimValues, getDimension, localeToFakerModule, readJsonFile
} = require('flexsim-lib');

const { parseAndValidateArgs, logArgs } = require('./helpers/args');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
const { createSyncMapItem, getOrCreateSyncMap } = require('./helpers/sync');
const { submitTask } = require('./helpers/task');
const { delay, log } = require('./helpers/util');
const { fetchWorkflow } = require('./helpers/workflow');


async function run() {
  const args = getArgs();
  const cfg = await readConfiguration(args);
  log('cfg:', cfg);
  const context = initializeContext(cfg, args);
  await loadTwilioResources(context);
  const { client, dimValues, syncMap } = context;
  log(`read workflow: ${context.workflow.friendlyName}`);
  const valuesDescriptor = { entity: 'tasks', phase: 'arrive' };
  const arrivalDim = getDimension('arrivalGap', context);
  const channelDim = getDimension('channel', context);

  let now = Date.now();
  while (now < context.simStopTS) {
    const customer = getFakeCustomer(args.locale, cfg.metadata.customers);
    valuesDescriptor.id = customer.fullName;
    calcDimsValues(context, valuesDescriptor);
    const ixnId = getAndAdvanceIxnId(context);
    const ixnValues = getDimValues(context, valuesDescriptor);
    const customAttrs = getAttributes(context, valuesDescriptor);
    const channelName = getDimValue(dimValues, valuesDescriptor.id, channelDim);
    const item = { key: ixnId, data: { taskStatus: 'initiated', ixnValues, attributes: customAttrs, customer }, itemTtl: 240 };
    const syncMapItem = await createSyncMapItem(client, args.syncSvcSid, syncMap.sid, item);
    if (channelName === 'voice') {
      const callSid = await submitInteraction(context, ixnId, customer, valuesDescriptor);
      log(`made call ${formatSid(callSid)}`);
    }
    else {
      const task = await submitTask(context, ixnId, customer, valuesDescriptor);
      log(`made task ${formatSid(task.sid)}`);
    }
    const arrivalGap = getDimValue(dimValues, valuesDescriptor.id, arrivalDim);
    await delay(arrivalGap * 1000);
    now = Date.now();
  }
  log(`flexsim finished`);
}

run();

const submitInteraction = async (ctx, ixnId, customer, valuesDescriptor) => {
  const { args } = ctx;
  const { custsimHost } = args;
  const config = {
    method: 'post',
    url: `${custsimHost}/makeCustomerCall`,
    data: {
      ixnId
    }
  };
  const response = await axios.request(config);
  const { data } = response;
  return data.callSid;
};

const getFakeCustomer = (locale, customers) => {
  const { country, phoneFormat } = customers;
  const fakerModule = localeToFakerModule(locale);

  const customer = {};
  //customer.fullName = fakerModule.person.fullName();
  customer.firstName = fakerModule.person.firstName();
  customer.lastName = fakerModule.person.lastName();
  customer.fullName = `${customer.firstName} ${customer.lastName}`;
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
  const { args, client } = context;

  context.workflow = await fetchWorkflow(context);
  context.channels = await fetchTaskChannels(context);
  context.syncMap = await getOrCreateSyncMap(client, args.syncSvcSid, 'calls');
}

const initializeContext = (cfg, args) => {
  const context = initializeCommonContext(cfg, args);
  context.simStopTS = context.simStartTS + (args.timeLim * 1000);
  context.ixnId = 0;
  return context;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { a: 'acct', A: 'auth', w: 'wrkspc', c: 'cfgdir', t: 'timeLim', l: 'locale' },
    required: []
  });
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, CUSTSIM_HOST, SYNC_SVC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  args.locale = args.locale || 'en-us';
  args.custsimHost = CUSTSIM_HOST;
  args.syncSvcSid = SYNC_SVC_SID;
  logArgs(args);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;

  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, workflow };
}

function getAndAdvanceIxnId(context) {
  context.ixnId = context.ixnId + 1;
  return context.ixnId;
}
