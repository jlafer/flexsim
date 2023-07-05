require("dotenv").config();

async function makeCall(from, to) {
  client.calls
    .create({
      to,
      from,
      twiml: '<Response><Say>Hello!</Say><Gather timeout=60>Can I get some help?</Gather></Response>'
    })
}

const from = '+15072747105';
const to = '+16292091380';

const { ACCOUNT_SID, AUTH_TOKEN } = process.env;
const client = require('twilio')(ACCOUNT_SID, AUTH_TOKEN);

makeCall(from, to);
