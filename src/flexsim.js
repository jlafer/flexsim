require("dotenv").config();
const axios = require('axios');
const {
  calcDimsValues, formatDt, formatSid, getAttributes, getDimValue, getSingleDimInstance, localeToFakerModule, readJsonFile
} = require('flexsim-lib');

const { parseAndValidateArgs } = require('./helpers/args');
const { fetchTaskChannels } = require('./helpers/channel');
const { initializeCommonContext } = require('./helpers/context');
const { createSyncMapItem, getOrCreateSyncMap } = require('./helpers/sync');
const { submitTask } = require('./helpers/task');
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
  const arrivalDimAndInst = getSingleDimInstance('arrivalGap', dimInstances);
  const channelDimAndInst = getSingleDimInstance('channel', dimInstances);
  let now = Date.now();
  while (now < context.simStopTS) {
    const customer = getFakeCustomer(args.locale, cfg.metadata.customers);
    valuesDescriptor.id = customer.fullName;
    calcDimsValues(context, valuesDescriptor);
    const channelName = 'voice';
    //const channelName = getDimValue(dimValues, valuesDescriptor.id, channelDimAndInst);
    if (channelName === 'voice') {
      const data = await submitInteraction(context, customer, valuesDescriptor);
      console.log(`flexsim: made call ${formatSid(data.callSid)} at`, formatDt(now));
    }
    else {
      const task = await submitTask(context, customer, valuesDescriptor);
      console.log(`new task ${formatSid(task.sid)} at`, formatDt(now));
    }
    const arrivalGap = getDimValue(dimValues, valuesDescriptor.id, arrivalDimAndInst);
    await delay(arrivalGap * 1000);
    now = Date.now();
  }
  console.log('custsim finished at', formatDt(now));
}

run();

const submitInteraction = async (ctx, customer, valuesDescriptor) => {
  const { args, client, syncMap } = ctx;
  const customAttrs = getAttributes(ctx, valuesDescriptor);
  const { custsimHost, syncSvcSid } = args;
  const digits = '42';
  const config = {
    method: 'post',
    url: `${custsimHost}/makeCustomerCall`,
    data: {
      ...customAttrs, sendDigits: `wwwww${digits}#`
    }
  };
  const response = await axios.request(config);
  const { data } = response;
  const item = { key: digits, data: customAttrs, itemTtl: 120 };
  createSyncMapItem(client, syncSvcSid, syncMap.sid, item);
  console.log(`saved ixn data into Sync map for call ${data.callSid}`, customAttrs);
  return data;
};

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
  const { args, client } = context;
  context.workflow = await fetchWorkflow(context);
  context.channels = await fetchTaskChannels(context);
  context.syncMap = await getOrCreateSyncMap(client, args.syncSvcSid, 'calls');
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
  const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID, CUSTSIM_HOST, SYNC_SVC_SID } = process.env;
  args.acct = args.acct || ACCOUNT_SID;
  args.auth = args.auth || AUTH_TOKEN;
  args.wrkspc = args.wrkspc || WRKSPC_SID;
  args.cfgdir = args.cfgdir || 'config';
  args.timeLim = args.timeLim || 3600;
  args.locale = args.locale || 'en-us';
  args.custsimHost = CUSTSIM_HOST;
  args.syncSvcSid = SYNC_SVC_SID;
  const { acct, wrkspc, cfgdir, timeLim, locale, custsimHost, syncSvcSid } = args;
  console.log('acct:', acct);
  console.log('wrkspc:', wrkspc);
  console.log('cfgdir:', cfgdir);
  console.log('timeLim:', timeLim);
  console.log('locale:', locale);
  console.log('custsimHost:', custsimHost);
  console.log('syncSvcSid:', syncSvcSid);
  return args;
}

async function readConfiguration(args) {
  const { cfgdir } = args;
  const metadata = await readJsonFile(`${cfgdir}/metadata.json`);
  const workflow = await readJsonFile(`${cfgdir}/workflow.json`);
  return { metadata, workflow };
}
