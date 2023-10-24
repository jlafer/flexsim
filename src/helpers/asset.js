const axios = require('axios');
const FormData = require('form-data');

const { delay, log } = require('./util');

async function getOrCreateServerlessService(ctx) {
  const { cfg, client } = ctx;

  const name = `flexsim-${cfg.metadata.brand}`;
  try {
    const service = await client.serverless.v1.services(name).fetch();
    return service.sid;
  }
  catch (err) {
    const { code } = err;
    console.log(`got error ${code} while reading serverless service ${name}`);
    if (code === 20404) {
      const service = await client.serverless.v1.services.create({ uniqueName: name, friendlyName: name });
      return service.sid;
    }
    throw err;
  }
}

async function getOrCreateEnvironment(ctx) {
  const { client, serverless } = ctx;

  let environment;

  const environments = await client.serverless.v1.services(serverless).environments
    .list({ limit: 20 });
  environment = environments.find(a => a.uniqueName === 'prod');
  if (!!environment)
    return environment.sid;
  environment = await client.serverless.v1.services(serverless).environments
    .create({ uniqueName: 'prod', domainSuffix: 'prod' });
  return environment.sid;
}

async function getOrCreateSpeechAsset(ctx) {
  const { client, serverless } = ctx;

  let asset;

  const assets = await client.serverless.v1.services(serverless).assets
    .list({ limit: 20 });
  asset = assets.find(a => a.friendlyName === 'speech');
  if (!!asset)
    return asset.sid;
  asset = await client.serverless.v1.services(serverless).assets
    .create({ friendlyName: 'speech' });
  return asset.sid;
}

async function createSpeechAssetVersion(ctx) {
  const { args, cfg, serverless, speechAsset } = ctx;
  const { acct, auth } = args;
  const { speech } = cfg;
  const serviceUrl = `https://serverless-upload.twilio.com/v1/Services/${serverless}`;
  const uploadUrl = `${serviceUrl}/Assets/${speechAsset}/Versions`;

  const form = new FormData();
  form.append('Path', '/speech.json');
  form.append('Visibility', 'public');
  form.append('Content', JSON.stringify(speech), {
    contentType: 'application/json',
  });

  // Create a new Asset Version
  const response = await axios
    .post(uploadUrl, form, {
      auth: {
        username: acct,
        password: auth,
      },
      headers: form.getHeaders(),
    })
  const newVersionSid = response.data.sid;
  console.log(`speech asset version sid = ${newVersionSid}`);
  return newVersionSid;
}

async function buildAndDeployServerless(ctx) {
  const { client, environment, serverless, speechAssetVersion } = ctx;

  const build = await client.serverless.v1.services(serverless).builds
    .create({ assetVersions: [speechAssetVersion] });
  const buildStatus = await waitForBuild(client, serverless, build.sid);
  log(`build completed (${build.sid}) with status: ${buildStatus}`);
  const deployment = await client.serverless.v1.services(serverless)
    .environments(environment).deployments.create({ buildSid: build.sid });
  log(`created deployment ${deployment.sid} of build ${build.sid} into env ${environment}`);
  return deployment;
}

const waitForBuild = async (client, serviceSid, sid) => {
  let building = true;
  let build;
  while (building) {
    await delay(2000);
    build = await client.serverless.v1.services(serviceSid).builds(sid).fetch();
    if (build.status !== 'building')
      building = false;
  }
  return Promise.resolve(build.status);
};

module.exports = {
  getOrCreateServerlessService,
  getOrCreateEnvironment,
  createSpeechAssetVersion,
  getOrCreateSpeechAsset,
  buildAndDeployServerless
}