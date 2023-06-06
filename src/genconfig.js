require("dotenv").config();
const faker = require('faker');
const R = require('ramda');

const { parseAndValidateArgs } = require('./helpers/args');
const { readJsonFile, writeToJsonFile } = require('./helpers/files');

async function run() {
  const args = getArgs();
  const { cfgdir } = args;
  const domain = await readDomainData(args);
  const context = { args, domain };
  const cfg = genConfiguration(context);
  await writeCfgToCfgdir(cfgdir, cfg);
}

run();

function genConfiguration(context) {
  const { domain } = context;
  const { agentCnt, dimensions } = domain;
  const cfg = {};
  cfg.simulation = R.pick(['arrivalRate', 'brand', 'handleTimeBase'], domain);
  cfg.topics = getTopics(dimensions);
  cfg.skills = genSkills(cfg.topics);
  cfg.channels = getChannels(dimensions);
  cfg.activities = getActivities(dimensions);
  cfg.workers = genWorkers(agentCnt, cfg.skills);
  cfg.queues = cfg.topics.map(topicToQueue(cfg.skills));
  cfg.workflow = genWorkflow(cfg);
  return cfg;
}

function genWorkers(agentCnt, skills) {
  const workers = [];
  for (let i = 0; i < agentCnt; i++) {
    const data = makeWorker(i, skills);
    workers.push(data);
  }
  return workers;
}

const genWorkflow = (cfg) => {
  const { simulation, topics } = cfg;
  const filters = topics.map(topicToFilter);
  const workflow = {
    friendlyName: `${simulation.brand} Workflow`,
    configuration: {
      task_routing: {
        filters,
        default_filter: { queue: 'Everyone' }
      }
    }
  }
  return workflow;
};

const topicToFilter = (topic) => {
  const targets = [{
    queue: topic,
    timeout: 300
  }];
  return {
    filter_friendly_name: `${topic} Filter`,
    expression: `topic=='${topic}'`,
    targets
  };
};

const topicToQueue = (skills) =>
  (topic) => {
    const skill = skills.find(s => s === topic);
    const expr = `skill == '${skill}'`;
    const data = {
      targetWorkers: expr,
      friendlyName: topic
    }
    return data;
  }

function genSkills(topics) {
  return topics.map(t => t);
}

function getTopics(dimensions) {
  const dim = getDimension(dimensions, 'topic');
  return dim.values;
}

function getChannels(dimensions) {
  const dim = getDimension(dimensions, 'channel');
  return dim.values;
}

function getActivities(dimensions) {
  const dim = getDimension(dimensions, 'activity');
  return dim.values;
}

const makeWorker = (i, skills) => {
  const agtNum = `${i}`.padStart(3, '0');
  const friendlyName = `Agent_${agtNum}`;
  const full_name = faker.name.findName();
  const skill = getRandomSkill(skills);
  const attributes = { skill, data: 'flexsim', contact_uri: `client:${friendlyName}`, full_name };
  return { friendlyName, attributes };
};

function getRandomSkill(skills) {
  const idx = getRandomInt(skills.length);
  const skill = skills[idx];
  return skill;
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function getDimension(dimensions, name) {
  return dimensions.find(dim => dim.name === name)
}

async function writeCfgToCfgdir(cfgdir, cfg) {
  const { activities, channels, queues, workers, workflow, simulation } = cfg;
  let path;
  path = `${cfgdir}/activities.json`;
  await writeToJsonFile(path, activities);
  path = `${cfgdir}/channels.json`;
  await writeToJsonFile(path, channels);
  path = `${cfgdir}/workflow.json`;
  await writeToJsonFile(path, workflow);
  path = `${cfgdir}/workers.json`;
  await writeToJsonFile(path, workers);
  path = `${cfgdir}/queues.json`;
  await writeToJsonFile(path, queues);
  path = `${cfgdir}/simulation.json`;
  await writeToJsonFile(path, simulation);
}

async function readDomainData(args) {
  const { domaindir } = args;
  const domain = await readJsonFile(`${domaindir}/domain.json`);
  return domain;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { d: 'domaindir', c: 'cfgdir' },
    required: []
  });
  const { } = process.env;
  args.domaindir = args.domaindir || 'domain';
  const { domaindir, cfgdir } = args;
  console.log('domaindir:', domaindir);
  console.log('cfgdir:', cfgdir);
  return args;
}
