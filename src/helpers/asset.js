const axios = require('axios');
const R = require('ramda');
const FormData = require('form-data');

async function fetchSpeechAssets(ctx) {
  const { args, cfg, client } = ctx;
  const { serverless } = args;
  const assets = await client.serverless.v1.services(serverless)
    .assets
    .list({ limit: 20 });
  const asset = assets.find(a => a.friendlyName === 'speech');
  return asset;
}

function removeSpeechAssets(ctx) {
  const { args, client, speechAssets } = ctx;
  const { serverless } = args;

  if (!!speechAssets) {
    console.log(`removing speech asset: ${speechAssets.sid}`);
    client.serverless.v1.services(serverless)
      .assets(speechAssets.sid)
      .remove();
  }
}

async function createSpeechAssets(ctx) {
  const { args, cfg, client } = ctx;
  const { acct, auth, serverless } = args;
  const { speech } = cfg;
  const asset = await client.serverless.v1.services(serverless)
    .assets
    .create({ friendlyName: 'speech' });
  const serviceUrl = `https://serverless-upload.twilio.com/v1/Services/${serverless}`;
  const uploadUrl = `${serviceUrl}/Assets/${asset.sid}/Versions`;

  const form = new FormData();
  form.append('Path', '/speech.json');
  form.append('Visibility', 'private');
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

module.exports = {
  createSpeechAssets,
  fetchSpeechAssets,
  removeSpeechAssets
}